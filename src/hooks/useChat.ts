import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, ReferencedSession, Session, ToolCallInfo, Attachment, PluginResultInfo, ObserverReflectionInfo, ExecutionPlanInfo, PlanStepInfo, ReactPhaseInfo, QueueStateInfo, AgentEvent, AgentStatusInfo } from '../types/chat';
import type { InventoryQueryPayload, QueryResult, DataSourceType } from '../types/inventory-query';
import { CHAT_API_URL, INVENTORY_QUERY_API_URL } from '../constants/api';
import { useAppSettings, useAppearanceSettings } from '../contexts/AppSettingsContext';
import { useToolPermission } from '../contexts/ToolPermissionContext';
import { isDesktopApp } from '../utils/env';
// v2.8.9: 子 hooks 已提取为独立模块，未来可逐步迁移：
// import { useRenderScheduler } from './useRenderScheduler';
// import { useAbortControl } from './useAbortControl';

/** 从 localStorage 读取默认模型 ID */
function getDefaultModelId(): string {
  try {
    const raw = localStorage.getItem('cdf-know-clow-settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      const defaultModelId = parsed?.models?.defaultModelId;
      if (defaultModelId && typeof defaultModelId === 'string') {
        return defaultModelId;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return 'auto';
}

export interface SendMessageOptions {
  /** 技能上下文：注入到 AI 对话的 prompt 模板 */
  skillContext?: string;
  /** 技能 ID：发送到后端用于统计与追踪 */
  skillId?: string;
  /** 引用的会话 ID 列表：用于关联历史对话 */
  referencedSessionIds?: string[];
  /** 引用的会话详情：用于前端展示 chip */
  referencedSessions?: ReferencedSession[];
  /** 指定使用的模型 ID（优先于 session.model） */
  model?: string;
  /** 附件列表（图片、文件等） */
  attachments?: Attachment[];
  /** 推理强度（'high' 深度思考 / 'max' 极致推理） */
  reasoningEffort?: string;
  /** 执行模式（覆盖全局默认值） */
  executionMode?: 'legacy' | 'observer' | 'react' | 'agent';
  /** v7.0: 队列模式（覆盖全局默认值）：collect(合并) / steer(转向) / followup(追加) */
  queueMode?: 'collect' | 'steer' | 'followup';
  /** v8.0: 指定使用的 Agent ID（空=不使用 Agent） */
  agentId?: string;
}

/** inventory_query JSON 块正则 */
const QUERY_BLOCK_REGEX = /```inventory_query\s*\n([\s\S]*?)\n```/;

/**
 * v2.8.6: 自适应渲染调度器 — WKWebView 兼容
 * WKWebView 在窗口可见但未交互时会暂停 requestAnimationFrame，
 * 导致 SSE 流式内容堆积不渲染。在 pywebview 环境中降级为 setTimeout(fn, 16)，
 * 确保渲染不被暂停。浏览器环境仍使用 rAF 以保持与显示器刷新率对齐。
 */
const IS_PYWEBVIEW = isDesktopApp();

const scheduleFrame = IS_PYWEBVIEW
  ? (fn: FrameRequestCallback): number => window.setTimeout(() => fn(Date.now()), 16)
  : (fn: FrameRequestCallback): number => requestAnimationFrame(fn);

const cancelFrame = IS_PYWEBVIEW
  ? (id: number): void => window.clearTimeout(id)
  : (id: number): void => cancelAnimationFrame(id);

export function useChat(currentSession: Session | undefined, onSessionUpdate: (session: Session) => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { updateSettings } = useAppSettings();
  const { settings: appearance } = useAppearanceSettings();
  const { requestPermission, trustMode } = useToolPermission();
  /** v1.7.0: 每个会话级别限制一次 SQL 失败自动重试 */
  const autoRetriedRef = useRef<boolean>(false);
  /** v1.8.0: 当前正在流式输出的消息 ID */
  const streamingMsgIdRef = useRef<string | null>(null);
  /** v1.8.1: 使用 ref 存储 session 和 callback，避免引用变化导致 sendMessage 重新创建 */
  const sessionRef = useRef<Session | undefined>(currentSession);
  const onSessionUpdateRef = useRef<(session: Session) => void>(onSessionUpdate);
  const isLoadingRef = useRef<boolean>(isLoading);
  /** v1.9.2: 使用 ref 保存最新的 settings，避免 sendMessage 闭包中引用旧值 */
  const settingsRef = useRef(appearance);
  /** v2.5.0: 免确认模式 ref，SSE 回调中使用 */
  const trustModeRef = useRef(trustMode);

  /** v1.8.0: AbortController 用于中断请求 */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** v1.8.2: 用户手动停止标志（不使用 AbortController signal，避免 Electron ERR_ABORTED） */
  const stoppedRef = useRef(false);

  // v1.8.1: 使用 useEffect 同步 ref 值，避免渲染时直接赋值导致 Fast Refresh 问题
  useEffect(() => {
    sessionRef.current = currentSession;
  }, [currentSession]);

  useEffect(() => {
    onSessionUpdateRef.current = onSessionUpdate;
  }, [onSessionUpdate]);

  useEffect(() => {
    isLoadingRef.current = isLoading;
  }, [isLoading]);

  useEffect(() => {
    settingsRef.current = appearance;
  }, [appearance]);

  // v2.5.0: 同步 trustMode 到 ref（SSE 回调中使用）
  useEffect(() => {
    trustModeRef.current = trustMode;
  }, [trustMode]);

  /**
   * v1.8.0: 中断当前 AI 生成
   */
  const stopGeneration = useCallback(() => {
    stoppedRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  /**
   * v1.7.0: SQL 执行失败后的自动重试
   * 构造"上次查询失败，请修正 SQL"的纠正消息，重新发起一轮对话
   * 限制：每会话仅重试 1 次，通过 autoRetriedRef 控制
   */
  const retryOnSqlFailure = useCallback(async (
    session: Session,
    originalContent: string,
    apiData: { code: number; message: string },
    onSessionUpdate: (session: Session) => void,
  ) => {
    if (autoRetriedRef.current) return;
    autoRetriedRef.current = true;

    const correctionMessage = `上一次库存查询 SQL 执行失败，错误信息：${apiData.message || '未知错误'}。请修正 SQL 语句后重新查询。原始需求：${originalContent}`;

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content: correctionMessage,
      timestamp: new Date(),
    };

    const updatedSession = { ...session, messages: [...session.messages, userMsg] };
    onSessionUpdateRef.current(updatedSession);

    try {
      // v2.2.2: 使用 fetch + ReadableStream 代替 XHR
      const fullContent = await new Promise<string>(async (resolve, reject) => {
        try {
          const response = await fetch(`${CHAT_API_URL}?_t=${Date.now()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
            },
            body: JSON.stringify({
              sessionId: session.id,
              message: correctionMessage,
              model: session.model,
              skillId: 'builtin-inventory-query',
            }),
          });

          if (!response.ok || !response.body) {
            reject(new Error(`HTTP ${response.status}`));
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let result = '';
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                resolve(result);
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'text') result += data.content;
                  } catch { /* parse error */ }
                }
              }
            }
          } catch (readErr) {
            reject(readErr);
          }
        } catch (fetchErr) {
          reject(fetchErr);
        }
      });

      // 递归处理可能的新 inventory_query 块
      const queryMatch = fullContent.match(QUERY_BLOCK_REGEX);
      if (queryMatch) {
        const jsonStr = queryMatch[1];
        const cleanContent = fullContent.replace(QUERY_BLOCK_REGEX, '').trim();

        const retryAssistantMsg: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: cleanContent,
          timestamp: new Date(),
          metadata: { loading: true, autoRetried: true },
        };

        const sessionWithLoading = { ...updatedSession, messages: [...updatedSession.messages, retryAssistantMsg] };
        onSessionUpdateRef.current(sessionWithLoading);

        try {
          const payload: InventoryQueryPayload = JSON.parse(jsonStr);
          const apiRes = await fetch(INVENTORY_QUERY_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sql: payload.sql,
              chartType: payload.chartType || 'table',
              chartConfig: payload.chartConfig,
              dataSource: payload.dataSource,
              queryIntent: payload.queryIntent,
            }),
          });

          const retryApiData = await apiRes.json();
          if (retryApiData.code === 0 && retryApiData.data) {
            const queryResult: QueryResult = retryApiData.data;
            retryAssistantMsg.metadata = {
              queryResult,
              loading: false,
              autoRetried: true,
            };
          } else {
            retryAssistantMsg.content = cleanContent + `\n\n> ⚠️ 重试后库存查询仍失败：${retryApiData.message || '未知错误'}`;
            retryAssistantMsg.metadata = {
              loading: false,
              error: retryApiData.message || '查询失败',
              errorCode: 'SQL_EXEC_FAILED',
              autoRetried: true,
            };
          }
        } catch {
          retryAssistantMsg.content = cleanContent + '\n\n> ⚠️ 重试库存查询请求失败，请稍后再试。';
          retryAssistantMsg.metadata = {
            loading: false,
            error: '重试请求失败',
            autoRetried: true,
          };
        }
      } else {
        const retryAssistantMsg: Message = {
          id: uuidv4(),
          role: 'assistant',
          content: fullContent,
          timestamp: new Date(),
          metadata: { autoRetried: true },
        };
        const finalSession = { ...updatedSession, messages: [...updatedSession.messages, retryAssistantMsg] };
        onSessionUpdateRef.current(finalSession);
      }
    } catch (e) {
      // console.error('[useChat] Auto-retry failed:', e);
    }
  }, []);

  const sendMessage = useCallback(async (content: string, options?: SendMessageOptions) => {
    // v1.8.1: 使用 ref 读取最新值，避免依赖变化导致函数重新创建
    // v1.9.3: 允许空文字但带有附件的消息发送
    const hasAttachments = options?.attachments && options.attachments.length > 0;
    if ((!content.trim() && !hasAttachments) || isLoadingRef.current) return;
    setIsLoading(true);
    isLoadingRef.current = true;
    stoppedRef.current = false; // 重置停止标志

    // v1.8.0: 创建新的 AbortController
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const session = sessionRef.current || {
      id: uuidv4(),
      title: content.trim() ? content.slice(0, 30) : (options?.attachments?.[0]?.fileName || '图片'),
      model: getDefaultModelId(),
      messages: []
    };

    const effectiveModel = options?.model || session.model;

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date(),
      referencedSessions: options?.referencedSessions,
      attachments: options?.attachments,
      // v1.5.85: 记录用户消息实际使用的模型 ID，供重新生成时恢复
      model: effectiveModel,
    };
    const updatedSession = { ...session, messages: [...session.messages, userMsg] };
    onSessionUpdateRef.current(updatedSession);

    // v1.8.0: 创建流式 assistant 消息占位（实时更新）
    const streamingMsgId = uuidv4();
    streamingMsgIdRef.current = streamingMsgId;
    const streamingMsg: Message = {
      id: streamingMsgId,
      role: 'assistant',
      content: '',
      thinking: '',
      timestamp: new Date(),
      isStreaming: true,
      model: options?.model || session.model || 'auto',
    };
    const sessionWithStreaming = { ...session, messages: [...session.messages, userMsg, streamingMsg] };
    onSessionUpdateRef.current(sessionWithStreaming);

    // v2.8.3: Cache the messages prefix (all messages except the streaming placeholder).
    // During streaming, sessionWithStreaming.messages never changes — only streamingMsg is mutated in-place.
    // Caching the prefix avoids calling slice(0, -1) every rAF frame, which allocates a new array
    // and copies N-1 elements each time. For a 100-message conversation at 60fps, this saves
    // ~6,000 array element copies per second.
    const messagesPrefix = sessionWithStreaming.messages.slice(0, -1);

    // v1.8.4: 声明在外层 try 之前，使 catch 块也能访问
    let fullContent = '';

    try {

      const body: Record<string, unknown> = {
        sessionId: session.id,
        message: content,
        model: effectiveModel,
      };
      // 如果有技能上下文，传递给后端
      if (options?.skillContext) {
        body.skillContext = options.skillContext;
      }
      // 如果有技能 ID，传递给后端
      if (options?.skillId) {
        body.skillId = options.skillId;
      }
      // 如果有引用的会话 ID，传递给后端
      if (options?.referencedSessionIds && options.referencedSessionIds.length > 0) {
        body.referencedSessionIds = options.referencedSessionIds;
      }
      // 如果有附件，传递给后端
      if (options?.attachments && options.attachments.length > 0) {
        body.attachments = options.attachments;
      }
      // 如果有推理强度设置，传递给后端
      if (options?.reasoningEffort) {
        body.reasoningEffort = options.reasoningEffort;
      }
      // 如果有执行模式设置，传递给后端
      if (options?.executionMode) {
        body.executionMode = options.executionMode;
      }
      // v7.0: 如果有队列模式设置，传递给后端
      if (options?.queueMode) {
        body.queueMode = options.queueMode;
      }
      // v8.0: 如果有 Agent ID，传递给后端
      if (options?.agentId) {
        body.agentId = options.agentId;
      }
      // 如果有历史消息，添加到请求体（用于多轮对话）
      // v1.9.0: 包含 toolCalls 信息，确保多轮工具调用上下文不丢失
      // v1.9.3: 包含 attachments 信息，确保多轮图片上下文不丢失
      if (session.messages.length > 0) {
        body.conversationHistory = session.messages.map(m => {
          const msg: { role: string; content: string; toolCalls?: ToolCallInfo[]; attachments?: typeof m.attachments } = {
            role: m.role,
            content: m.content,
          };
          if (m.toolCalls && m.toolCalls.length > 0) {
            msg.toolCalls = m.toolCalls;
          }
          // v1.9.3: 传递附件信息，让后端在多轮对话中也能看到之前的图片
          if (m.attachments && m.attachments.length > 0) {
            msg.attachments = m.attachments;
          }
          return msg;
        });
      }

      // v2.2.2: 使用 fetch + ReadableStream 代替 XHR，WKWebView 中 ReadableStream 是真正的流式读取
      // 避免了 XHR readyState===3 在 WKWebView 中不可靠导致深度思考卡死的问题
      const MAX_RETRIES = 2;
      let currentAutoReason: string | undefined;
      let currentAutoReasonType: string | undefined;
      let currentErrorCode: string | null = null;
      let currentErrorMessage: string | null = null;
      let currentThinkingDuration: number | undefined;
      let currentThinkingType: 'deep' | 'local' = 'deep';

      // v1.5.185: 事件监听器引用 — 必须在 for 循环外部声明，
      // 以便 catch 块和重试路径都能正确清理
      let visibilityHandler: ((e: Event) => void) | null = null;
      let focusHandler: (() => void) | null = null;
      let pageshowHandler: ((e: PageTransitionEvent) => void) | null = null;
      const removeAllHandlers = () => {
        if (visibilityHandler) {
          try { document.removeEventListener('visibilitychange', visibilityHandler); } catch {}
          visibilityHandler = null;
        }
        if (focusHandler) {
          try { window.removeEventListener('focus', focusHandler); } catch {}
          focusHandler = null;
        }
        if (pageshowHandler) {
          try { window.removeEventListener('pageshow', pageshowHandler); } catch {}
          pageshowHandler = null;
        }
      };

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          let result = '';
          let autoReason: string | undefined;
          let autoReasonType: string | undefined;
          let errorCode: string | null = null;
          let errorMessage: string | null = null;
          let thinkingDuration: number | undefined;
          let doneReceived = false;

          // v2.8.0: 渲染队列 — 与显示器刷新率对齐（pywebview 用 setTimeout 16ms 代替 rAF）
          let pendingContent = '';
          let displayedContent = '';
          let renderHandle: number | null = null;
          let dirty = false; // v2.8.0: skip no-op renders (e.g. keep_alive without mutations)
          // v2.2.3: 提速渲染 — 深度思考产生大量文本，6字/20ms 太慢
          const BASE_CHUNK_SIZE = 24;
          // v2.8.5: 元数据渲染节流 — 纯 thinking/元数据事件时限制为 10fps
          // text 事件有 pendingContent 分块天然节流；元数据事件每帧都创建新对象引用，
          // 触发 React reconciliation + areEqual 34 字段比较，但 MarkdownRenderer 已有 150ms 节流，
          // 60fps 的状态更新纯属浪费。降至 10fps 足够 UI 响应。
          const METADATA_THROTTLE_MS = 100;
          let lastMetadataFlush = 0;

          // v8.3: 高频事件客户端聚合 — thinking 事件到达时先缓冲，
          // 由 flushRender 统一消费，避免每个 chunk 都触发 scheduleRender
          let thinkingBuffer = '';
          let thinkingBufferFlushed = false;

          const flushRender = () => {
            renderHandle = null;
            let shouldReschedule = false;

            // Process pending text content (chunked for typewriter effect)
            let contentChangedThisFrame = false;
            if (pendingContent.length > 0) {
              contentChangedThisFrame = true;
              const adaptiveChunk = Math.min(
                Math.max(BASE_CHUNK_SIZE, Math.ceil(pendingContent.length / 15)),
                pendingContent.length
              );
              const chunk = pendingContent.slice(0, adaptiveChunk);
              pendingContent = pendingContent.slice(adaptiveChunk);
              displayedContent += chunk;
              streamingMsg.content = displayedContent;
              dirty = true;
              if (pendingContent.length > 0) {
                shouldReschedule = true;
              }
            }

            // v8.3-fix: 消费 thinking buffer — 必须在元数据节流检查之前执行！
            // 否则 thinking 内容在节流窗口内永远不会被写入 streamingMsg，导致"思考中卡住"
            const hasThinkingBuffer = thinkingBuffer.length > 0;
            if (hasThinkingBuffer) {
              streamingMsg.thinking = (streamingMsg.thinking || '') + thinkingBuffer;
              thinkingBuffer = '';
              thinkingBufferFlushed = true;
              dirty = true;
            }

            // Skip render if nothing changed since last flush (e.g. keep_alive with no mutations)
            if (!dirty && !shouldReschedule) return;

            // v2.8.5: 纯元数据渲染节流 — 无 pending text/thinking 时限制为 10fps
            // text 事件始终立即渲染（用户体验关键），元数据可降频
            const isMetadataOnly = pendingContent.length === 0 && !shouldReschedule && !hasThinkingBuffer;
            if (isMetadataOnly) {
              const now = Date.now();
              if (now - lastMetadataFlush < METADATA_THROTTLE_MS) {
                // 节流窗口内 — 保持 dirty，下一帧重试
                renderHandle = scheduleFrame(flushRender);
                return;
              }
              lastMetadataFlush = now;
            }

            dirty = false;

            // Unified session update — coalesces text content + all metadata mutations
            // (thinking, tool_calls, react_phase, etc.) into a single React state update per frame.
            // SSE event handlers mutate streamingMsg in-place then call scheduleRender();
            // this flushRender picks up ALL mutations in one shot.
            // v8.3: 对象复用优化 — content 变化时创建新 msg 引用（触发 BotMessageContent 重渲染），
            // 纯元数据变化时复用 streamingMsg 引用（areEqual 的 === 快速路径生效，跳过 41 字段比较）
            const msgRef = contentChangedThisFrame
              ? { ...streamingMsg }
              : streamingMsg;

            onSessionUpdateRef.current({
              ...sessionWithStreaming,
              messages: [
                ...messagesPrefix,
                msgRef,
              ],
            });

            if (shouldReschedule) {
              renderHandle = scheduleFrame(flushRender);
            }
          };

          const scheduleRender = () => {
            dirty = true;
            if (renderHandle === null) {
              renderHandle = scheduleFrame(flushRender);
            }
          };

          // v1.5.185: visibilitychange 监听 — 页面重新可见时立即 flush
          // v1.5.190: 补充 focus/pageshow 监听 — 覆盖更多"应用切回"场景
          // v2.8.6: 移除 2s setInterval 兜底 — scheduleFrame 已用 setTimeout 16ms，
          // 不再受 WKWebView rAF 暂停影响，无需额外轮询
          removeAllHandlers();
          visibilityHandler = () => {
            if (document.visibilityState === 'visible') {
              try { flushRender(); } catch {}
            }
          };
          if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', visibilityHandler);
          }

          // v1.5.190: focus — 切换应用后切回 CrossWMS 时触发
          if (typeof window !== 'undefined') {
            focusHandler = () => {
              try { flushRender(); } catch {}
            };
            window.addEventListener('focus', focusHandler);

            // v1.5.190: pageshow — 页面从 bfcache 恢复时触发
            pageshowHandler = (e: PageTransitionEvent) => {
              if (e.persisted) {
                try { flushRender(); } catch {}
              }
            };
            window.addEventListener('pageshow', pageshowHandler);
          }

          // v1.8.0: 使用 AbortController signal 支持用户中断
          const response = await fetch(`${CHAT_API_URL}?_t=${Date.now()}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          // v2.2.2: 使用 ReadableStream 逐块读取，比 XHR responseText 增量读取可靠
          if (!response.body) {
            throw new Error('ReadableStream not supported');
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          // 心跳超时检测：30 秒内无数据则认为连接断开
          const HEARTBEAT_TIMEOUT_MS = 30000;
          let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

          const clearHeartbeat = () => {
            if (heartbeatTimer) {
              clearTimeout(heartbeatTimer);
              heartbeatTimer = null;
            }
          };

          const readWithHeartbeat = (): Promise<ReadableStreamReadResult<Uint8Array>> => {
            clearHeartbeat();
            return Promise.race([
              reader.read(),
              new Promise<never>((_, reject) => {
                heartbeatTimer = setTimeout(
                  () => reject(new Error('SSE 心跳超时（30s 无数据）')),
                  HEARTBEAT_TIMEOUT_MS,
                );
              }),
            ]);
          };

          try {
            while (true) {
              let readResult: ReadableStreamReadResult<Uint8Array>;
              try {
                readResult = await readWithHeartbeat();
              } catch (readErr) {
                if (readErr instanceof Error && readErr.message.includes('心跳超时')) {
                  throw new Error('SSE 连接超时：30 秒内未收到数据');
                }
                throw readErr;
              }
              const { done, value } = readResult;

              if (stoppedRef.current) {
                clearHeartbeat();
                await reader.cancel();
                break;
              }

              if (done) {
                clearHeartbeat();
                // 流自然结束 — v1.5.57: 流未正常结束保护
                if (!doneReceived && !result.trim()) {
                  const hasThinking = !!(streamingMsg.thinking && streamingMsg.thinking.trim());
                  if (hasThinking) {
                    const trimmed = streamingMsg.thinking!.trim();
                    const paragraphs = trimmed.split(/\n{2,}|\n(?=[A-Z\u4e00-\u9fff])/);
                    const lastParagraph = paragraphs.filter(p => p.trim().length > 20).pop() || trimmed;
                    result = lastParagraph.length > 800
                      ? `(思考摘要)\n\n${lastParagraph.slice(-800)}`
                      : `(思考摘要)\n\n${lastParagraph}`;
                    errorCode = null;
                    errorMessage = null;
                  } else {
                    errorCode = 'STREAM_INCOMPLETE';
                    errorMessage = '连接已断开，内容生成失败，请重试';
                    result = errorMessage;
                    streamingMsg.content = errorMessage;
                    streamingMsg.metadata = { error: '连接已断开', errorCode: 'STREAM_INCOMPLETE' };
                  }
                }
                if (renderHandle !== null) {
                  cancelFrame(renderHandle);
                  renderHandle = null;
                }
                pendingContent = '';
                streamingMsg.content = result;
                onSessionUpdateRef.current({
                  ...sessionWithStreaming,
                  messages: [
                    ...messagesPrefix,
                    { ...streamingMsg, content: result },
                  ],
                });
                break;
              }

              const chunk = decoder.decode(value, { stream: true });
              buffer += chunk;
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === 'text') {
                      if (result === '' && data.content === content) {
                        continue;
                      }
                      // v8.2-fix: 收到第一个 text 事件时标记 thinking 阶段结束
                      // 避免 ThinkingBlock 在内容生成阶段仍显示"正在思考..."
                      if (!streamingMsg.thinkingDone && streamingMsg.thinking) {
                        streamingMsg.thinkingDone = true;
                      }
                      result += data.content;
                      pendingContent += data.content;
                      scheduleRender();
                    }
                    if (data.type === 'init') {
                      if (data.autoReason) autoReason = data.autoReason;
                      if (data.autoReasonType) autoReasonType = data.autoReasonType;
                      if (data.reasoningEffort) {
                        streamingMsg.reasoningEffort = data.reasoningEffort;
                      }
                      if (data.model) {
                        streamingMsg.model = data.modelName || data.model;
                      }
                      if (data.cacheHit) {
                        streamingMsg.cacheHit = true;
                      }
                      scheduleRender();
                    }
                    if (data.type === 'thinking') {
                      // v8.3: 写入 buffer 而非直接拼接，由 flushRender 统一消费
                      thinkingBuffer += data.content;
                      if (data.thinkingType) {
                        streamingMsg.thinkingType = data.thinkingType;
                      }
                      // 仅在未调度时才调度（避免重复调度）
                      if (renderHandle === null) {
                        scheduleRender();
                      }
                    }
                    if (data.type === 'thinking_heartbeat') {
                      streamingMsg.thinkingElapsed = data.elapsed;
                      scheduleRender();
                    }
                    if (data.type === 'cache_hit') {
                      streamingMsg.cacheHit = true;
                      scheduleRender();
                    }
                    if (data.type === 'keep_alive') {
                      streamingMsg.thinkingElapsed = data.elapsed;
                      scheduleRender();
                    }
                    if (data.type === 'tool_call') {
                      const toolCall: ToolCallInfo = {
                        id: data.toolCallId,
                        name: data.toolName || 'unknown',
                        arguments: data.toolArgs || '{}',
                        result: data.toolResult || '',
                      };
                      streamingMsg.toolCalls = [...(streamingMsg.toolCalls || []), toolCall];
                      if (data.toolName === 'app:setBotName' && data.toolResult) {
                        try {
                          const parsed = JSON.parse(data.toolResult);
                          if (parsed.success && parsed.name) {
                            updateSettings({ appearance: { ...settingsRef.current, botName: parsed.name } });
                          }
                        } catch { /* JSON 解析失败，忽略 */ }
                      }
                      scheduleRender();
                    }
                    if (data.type === 'permission_request') {
                      // v2.5.0: 免确认模式下自动通过，不显示弹窗
                      if (trustModeRef.current) {
                        fetch('/api/permission-response', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ reqId: data.reqId, approved: true }),
                        }).catch(() => {});
                      } else {
                        streamingMsg.permissionRequest = {
                          reqId: data.reqId,
                          toolName: data.toolName,
                          toolArgs: data.toolArgs,
                          riskLevel: data.riskLevel,
                        };
                        scheduleRender();
                      }
                    }
                    if (data.type === 'tool_audit') {
                      // console.log('[useChat] tool_audit:', data);
                    }
                    // v4.0: observer_reflection — Observer 反思提示
                    if (data.type === 'observer_reflection') {
                      const reflection: ObserverReflectionInfo = {
                        toolName: data.toolName || 'unknown',
                        level: data.level || 'error',
                        hint: data.hint || '',
                        willRetry: data.willRetry ?? false,
                        retryIndex: data.retryIndex ?? 0,
                        maxRetries: data.maxRetries ?? 0,
                      };
                      streamingMsg.observerReflections = [...(streamingMsg.observerReflections || []), reflection];
scheduleRender();
                    }
                    // v4.0: execution_plan — 执行计划
                    if (data.type === 'execution_plan') {
                      streamingMsg.executionPlan = data.plan as ExecutionPlanInfo;
scheduleRender();
                    }
                    // v4.0: plan_step_update — 计划步骤状态变更
                    if (data.type === 'plan_step_update' && streamingMsg.executionPlan) {
                      const updatedPlan = { ...streamingMsg.executionPlan };
                      const stepIdx = updatedPlan.steps.findIndex(s => s.step === data.step);
                      if (stepIdx !== -1) {
                        updatedPlan.steps = updatedPlan.steps.map((s, i) =>
                          i === stepIdx ? { ...s, status: data.status || s.status } : s
                        );
                      }
                      streamingMsg.executionPlan = updatedPlan;
scheduleRender();
                    }
                    // v4.0: react_phase — ReAct 阶段切换
                    if (data.type === 'react_phase') {
                      streamingMsg.reactPhase = {
                        phase: data.phase,
                        step: data.step,
                        totalSteps: data.totalSteps,
                        description: data.description,
                      };
scheduleRender();
                    }
                    // v5.0: reflection_confidence — 反思置信度
                    if (data.type === 'reflection_confidence') {
                      streamingMsg.reflectionConfidence = {
                        confidenceScore: data.confidenceScore,
                        selfScore: data.selfScore,
                        shouldEarlyStop: data.shouldEarlyStop,
                        reason: data.reason,
                      };
scheduleRender();
                    }
                    // v5.0: budget_exceeded — 预算超出
                    if (data.type === 'budget_exceeded') {
                      streamingMsg.budgetExceeded = {
                        reason: data.reason,
                        consumedTurns: data.consumedTurns,
                        consumedTokens: data.consumedTokens,
                        maxTurns: data.maxTurns,
                        maxTokens: data.maxTokens,
                      };
scheduleRender();
                    }
                    // v5.0: complexity_assessment — 复杂度评估
                    if (data.type === 'complexity_assessment') {
                      streamingMsg.complexityAssessment = {
                        level: data.level,
                        estimatedSteps: data.estimatedSteps,
                        reason: data.reason,
                        recommendedMode: data.recommendedMode,
                      };
scheduleRender();
                    }
                    // v5.0: replan_triggered — 重规划触发
                    if (data.type === 'replan_triggered') {
                      streamingMsg.replanTriggered = {
                        reason: data.reason,
                        oldPlanId: data.oldPlanId,
                        newPlanId: data.newPlanId,
                      };
scheduleRender();
                    }
                    // v6.0: context_compressed — 语义压缩
                    if (data.type === 'context_compressed') {
                      streamingMsg.contextCompressed = {
                        strategy: data.strategy || 'semantic',
                        originalTokens: data.originalTokens ?? 0,
                        compressedTokens: data.compressedTokens ?? 0,
                        ratio: data.ratio ?? 0,
                        keyInfoPreserved: data.keyInfoPreserved,
                      };
scheduleRender();
                    }
                    // v6.0: plan_step_completed — 计划步骤完成
                    if (data.type === 'plan_step_completed') {
                      streamingMsg.planStepCompleted = {
                        planId: data.planId || '',
                        step: data.step || 0,
                        description: data.description || '',
                        toolName: data.toolName,
                      };
scheduleRender();
                    }
                    // v6.0: circuit_breaker_triggered — 熔断器触发
                    if (data.type === 'circuit_breaker_triggered') {
                      streamingMsg.circuitBreakerTriggered = {
                        toolName: data.toolName || 'unknown',
                        failureCount: data.failureCount || 0,
                        state: data.state || 'open',
                        alternativeTool: data.alternativeTool,
                      };
scheduleRender();
                    }
                    // v6.0: complexity_upgraded — 复杂度升级
                    if (data.type === 'complexity_upgraded') {
                      streamingMsg.complexityUpgraded = {
                        oldLevel: data.oldLevel || 'simple',
                        newLevel: data.newLevel || 'moderate',
                        reason: data.reason || '',
                      };
scheduleRender();
                    }
                    // v6.0: llm_reflection — LLM 辅助反思
                    if (data.type === 'llm_reflection') {
                      streamingMsg.llmReflection = {
                        insight: data.insight || '',
                        confidenceScore: data.confidenceScore ?? 0,
                      };
scheduleRender();
                    }
                    // v6.0: memory_retrieved — 长期记忆检索
                    if (data.type === 'memory_retrieved') {
                      streamingMsg.memoryRetrieved = {
                        count: data.count ?? 0,
                        summaries: data.summaries || [],
                      };
scheduleRender();
                    }
                    // v6.0: output_repaired — 输出修复
                    if (data.type === 'output_repaired') {
                      streamingMsg.outputRepaired = {
                        toolName: data.toolName || 'unknown',
                        repairDetails: data.repairDetails || '',
                      };
scheduleRender();
                    }
                    // v6.0: budget_adjusted — 预算调整
                    if (data.type === 'budget_adjusted') {
                      streamingMsg.budgetAdjusted = {
                        oldMaxTurns: data.oldMaxTurns ?? 0,
                        newMaxTurns: data.newMaxTurns ?? 0,
                        oldMaxTokens: data.oldMaxTokens,
                        newMaxTokens: data.newMaxTokens,
                        reason: data.reason || '',
                      };
scheduleRender();
                    }
                    // v3.0: client_tool 事件 — 服务端通知前端有插件需要在 reasoning 流中自动调用
                    if (data.type === 'client_tool') {
                      // console.log('[useChat] client_tool event received:', data.tool, data.args);
                    }
                    // v3.0: plugin_result 事件 — 插件执行结果插入 thinking 流
                    if (data.type === 'plugin_result') {
                      const pluginResult: PluginResultInfo = {
                        tool: data.tool || 'unknown',
                        output: data.output || '',
                        durationMs: data.durationMs,
                      };
                      streamingMsg.pluginResults = [...(streamingMsg.pluginResults || []), pluginResult];
                      // 将插件结果拼接到 thinking 内容中，以特殊标记包裹
                      if (streamingMsg.thinking) {
                        streamingMsg.thinking += `\n\n[Plugin: ${pluginResult.tool}] ${pluginResult.output}\n\n`;
                      }
scheduleRender();
                    }
                    // v7.0: 队列事件处理 — 实时反馈队列状态变化
                    if (data.type === 'queue_event' || data.type === 'queue_status') {
                      // 将队列状态存储到 streamingMsg 上，供 UI 组件渲染
                      streamingMsg.queueState = {
                        mode: data.mode,
                        state: data.state,
                        queueLength: data.queueLength,
                        type: data.type === 'queue_event' ? data.eventType : 'status',
                      };
scheduleRender();
                    }
                    if (data.type === 'queue_rejected') {
                      // 队列拒绝消息（已满）
                      streamingMsg.content = `⚠️ ${data.reason || '消息队列已满，请稍后再试'}`;
                      doneReceived = true;
                      errorCode = 'QUEUE_REJECTED';
                      errorMessage = data.reason;
                      scheduleRender();
                    }
                    // v8.2: Agent 编排事件 — agent_start / agent_end / subtask_create / subtask_assign / subtask_complete / reflect / plan
                    if (data.type === 'agent_start' || data.type === 'agent_end' || data.type === 'subtask_create' || data.type === 'subtask_assign' || data.type === 'subtask_complete' || data.type === 'reflect' || data.type === 'plan') {
                      // v8.2-fix: Agent 编排事件在 thinking 之后到达，标记 thinking 阶段结束
                      // 避免 ThinkingBlock 在 Agent 事件阶段仍显示"正在思考..."
                      if (!streamingMsg.thinkingDone && streamingMsg.thinking) {
                        streamingMsg.thinkingDone = true;
                      }
                      const event = data as AgentEvent;
                      streamingMsg.agentEvents = [...(streamingMsg.agentEvents || []), event];
                      // 同步更新 orchestrationState（如果存在）
                      if (data.type === 'subtask_create' && streamingMsg.orchestrationState) {
                        const st = data as { subTaskId: string; description: string; dependsOn: string[]; priority: number };
                        streamingMsg.orchestrationState = {
                          ...streamingMsg.orchestrationState,
                          subTasks: [
                            ...streamingMsg.orchestrationState.subTasks,
                            {
                              id: st.subTaskId,
                              description: st.description,
                              assignedAgentId: null,
                              status: 'pending' as const,
                            },
                          ],
                        };
                      }
                      if (data.type === 'subtask_assign' && streamingMsg.orchestrationState) {
                        const st = data as { subTaskId: string; agentId: string };
                        streamingMsg.orchestrationState = {
                          ...streamingMsg.orchestrationState,
                          subTasks: streamingMsg.orchestrationState.subTasks.map(t =>
                            t.id === st.subTaskId ? { ...t, assignedAgentId: st.agentId, status: 'running' as const } : t
                          ),
                        };
                      }
                      if (data.type === 'subtask_complete' && streamingMsg.orchestrationState) {
                        const st = data as { subTaskId: string; status: 'completed' | 'failed' };
                        streamingMsg.orchestrationState = {
                          ...streamingMsg.orchestrationState,
                          subTasks: streamingMsg.orchestrationState.subTasks.map(t =>
                            t.id === st.subTaskId ? { ...t, status: st.status } : t
                          ),
                        };
                      }
                      if (data.type === 'agent_start' || data.type === 'agent_end') {
                        const agentEvt = data as { agentId: string; agentRole: string };
                        const existing = streamingMsg.agentStatuses || [];
                        const idx = existing.findIndex(a => a.agentId === agentEvt.agentId);
                        let updatedStatuses: AgentStatusInfo[];
                        if (data.type === 'agent_start') {
                          const newStatus: AgentStatusInfo = {
                            agentId: agentEvt.agentId,
                            agentRole: agentEvt.agentRole,
                            agentName: agentEvt.agentRole,
                            status: 'busy',
                            currentTask: (data as { taskDescription?: string }).taskDescription,
                          };
                          updatedStatuses = idx >= 0
                            ? existing.map((a, i) => i === idx ? newStatus : a)
                            : [...existing, newStatus];
                        } else {
                          const endEvt = data as { status: 'success' | 'failed' | 'timeout'; error?: string };
                          updatedStatuses = idx >= 0
                            ? existing.map((a, i) => i === idx ? { ...a, status: endEvt.status === 'success' ? 'idle' as const : 'error' as const, currentTask: endEvt.error || undefined } : a)
                            : existing;
                        }
                        streamingMsg.agentStatuses = updatedStatuses;
                      }
                      scheduleRender();
                    }
                    if (data.type === 'done') {
                      doneReceived = true;
                      errorCode = data.errorCode ?? null;
                      errorMessage = data.errorMessage ?? null;
                      thinkingDuration = data.thinkingDuration;
                      // v8.2-fix: 流结束，确保 thinkingDone 标记为 true
                      // 避免 AI 只有 thinking 没有 text 时 thinkingDone 未设置
                      if (!streamingMsg.thinkingDone) {
                        streamingMsg.thinkingDone = true;
                      }
                      // v1.5.116: 模型降级信息
                      if (data.fallbackModel) {
                        streamingMsg.fallbackModel = data.fallbackModel;
                        streamingMsg.fallbackReason = data.fallbackReason;
                      }
                      if (data.thinkingType) {
                        currentThinkingType = data.thinkingType;
                      }
                      if (data.usage) {
                        streamingMsg.usage = data.usage;
                      }
                      if (errorCode && errorMessage) {
                        result = errorMessage;
                        fullContent = errorMessage;
                        streamingMsg.content = errorMessage;
                        scheduleRender();
                      }
                    }
                  } catch { /* parse error */ }
                }
              }
            }
          } catch (readErr: any) {
            clearHeartbeat();
            // reader.read() 异常 — 仅用户手动停止时吞掉错误
            if (stoppedRef.current) {
              // 用户手动停止，保留已生成内容
            } else {
              removeAllHandlers();
              throw readErr;
            }
          }

          fullContent = result;
          currentAutoReason = autoReason;
          currentAutoReasonType = autoReasonType;
          currentErrorCode = errorCode;
          currentErrorMessage = errorMessage;
          currentThinkingDuration = thinkingDuration;

          // 成功，跳出重试循环
          removeAllHandlers();
          break;
        } catch (fetchErr) {
          const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          if ((/abort|failed to fetch/i.test(errMsg)) && attempt < MAX_RETRIES - 1 && !stoppedRef.current) {
            // console.warn(`[useChat] stream fetch failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying...`);
            fullContent = '';
            // 重置流式消息内容，避免重试时 UI 显示旧内容
            streamingMsg.content = '';
            streamingMsg.thinking = '';
            onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...messagesPrefix, { ...streamingMsg, content: '', thinking: '' }] });
            continue;
          }
          removeAllHandlers();
          throw fetchErr;
        }
      }

      removeAllHandlers();

      // v1.8.0: 流结束，将占位消息替换为最终消息
      streamingMsgIdRef.current = null;
      streamingMsg.isStreaming = false;
      streamingMsg.thinkingDuration = currentThinkingDuration;
      streamingMsg.thinkingType = currentThinkingType;
      streamingMsg.autoReason = currentAutoReason;
      streamingMsg.autoReasonType = currentAutoReasonType as any;

      if (currentErrorCode) {
        streamingMsg.metadata = {
          error: currentErrorMessage || '请求失败',
          errorCode: currentErrorCode,
        };
      }

      // v1.9.5-fix: 如果 AI 没有输出文本内容（只有思考或只有工具调用），用思考内容兜底
      // 避免 fullContent 为空导致显示"内容生成失败，请重试"
      if (!fullContent && !currentErrorCode) {
        const thinking = streamingMsg.thinking;
        if (thinking && thinking.trim()) {
          const trimmed = thinking.trim();
          // v2.2.0: 取最后完整段落
          const paragraphs = trimmed.split(/\n{2,}|\n(?=[A-Z\u4e00-\u9fff])/);
          const lastParagraph = paragraphs.filter(p => p.trim().length > 20).pop() || trimmed;
          const summary = lastParagraph.length > 800 ? lastParagraph.slice(-800) : lastParagraph;
          fullContent = `> ⚡ AI 思考过程如下，未生成独立文本回答：\n\n${summary}`;
          streamingMsg.content = fullContent;
        }
      }

      // ---- inventory_query JSON 块拦截逻辑 ----
      const queryMatch = fullContent.match(QUERY_BLOCK_REGEX);
      if (queryMatch && !currentErrorCode) {
        // 提取 JSON 块内容
        const jsonStr = queryMatch[1];
        // 从 fullContent 中移除 JSON 块，得到 cleanContent
        const cleanContent = fullContent.replace(QUERY_BLOCK_REGEX, '').trim();
        streamingMsg.content = cleanContent;

        // v1.7.0: 提前解析 payload 以提取 dataSource 和 queryIntent
        let extractedDataSource: DataSourceType | undefined;
        let extractedQueryIntent: string | undefined;
        try {
          const payload: InventoryQueryPayload = JSON.parse(jsonStr);
          extractedDataSource = payload.dataSource;
          extractedQueryIntent = payload.queryIntent;
        } catch { /* JSON 解析失败，忽略额外字段 */ }

        // 先用 cleanContent 创建 assistant 消息（带 loading 状态）
        streamingMsg.metadata = { loading: true };
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...messagesPrefix, { ...streamingMsg, metadata: { loading: true } }] });

        // 异步调用后端 API 执行查询
        (async () => {
          try {
            const payload: InventoryQueryPayload = JSON.parse(jsonStr);
            const apiRes = await fetch(INVENTORY_QUERY_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sql: payload.sql,
                chartType: payload.chartType || 'table',
                chartConfig: payload.chartConfig,
                dataSource: payload.dataSource,
                queryIntent: payload.queryIntent,
              }),
            });

            const apiData = await apiRes.json();
            if (apiData.code === 0 && apiData.data) {
              // 成功：更新消息 metadata，移除 loading
              const queryResult: QueryResult = apiData.data;
              streamingMsg.metadata = {
                queryResult,
                loading: false,
              };
            } else {
              // v1.7.0: SQL 执行失败 — 触发自动重试
              streamingMsg.content = cleanContent + `\n\n> ⚠️ 库存查询失败：${apiData.message || '未知错误'}`;
              streamingMsg.metadata = {
                loading: false,
                error: apiData.message || '查询失败',
                errorCode: 'SQL_EXEC_FAILED',
              };

              // 更新会话后触发自动重试（包含 userMsg + streamingMsg）
              const failedSession = {
                ...updatedSession,
                messages: [...updatedSession.messages, streamingMsg],
              };
              onSessionUpdateRef.current(failedSession);

              // 异步自动重试（不阻塞当前 UI 更新，基于包含原始 userMsg 的会话）
              retryOnSqlFailure(updatedSession, content, apiData, onSessionUpdateRef.current).catch(() => {});
              return; // 跳过下方的 onSessionUpdate（已在此处更新）
            }
          } catch (apiErr) {
            // API 调用异常
            // console.error('[useChat] inventory_query API error:', apiErr);
            streamingMsg.content = cleanContent + '\n\n> ⚠️ 库存查询请求失败，请稍后重试。';
            streamingMsg.metadata = {
              loading: false,
              error: '请求失败',
              errorCode: 'NETWORK_ERROR',
            };
          }

          // 更新会话（基于包含 userMsg 的 updatedSession）
          const finalSession = {
            ...updatedSession,
            messages: [
              ...updatedSession.messages,
              streamingMsg,
            ],
          };
          onSessionUpdateRef.current(finalSession);
        })().catch(() => {});
      } else {
        // 无 inventory_query JSON 块，直接更新最终消息
        // v1.9.3: 确保 content 是完整的（渲染队列可能还没消化完）
        // v2.8.4: 有错误码但无内容时（如 queue_rejected），用错误消息兜底
        // 避免 done=true 处理器用 result='' 覆盖 queue_rejected 设置的错误消息
        if (!fullContent && currentErrorCode && currentErrorMessage) {
          fullContent = currentErrorMessage;
        }
        streamingMsg.content = fullContent;
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...messagesPrefix, streamingMsg] });
      }

      // v1.7.0: 重置 autoRetried 标记（新对话开始时）
      if (session.messages.length === 0) {
        autoRetriedRef.current = false;
      }
    } catch (e) {
      // console.error('[useChat] sendMessage error:', e);
      streamingMsgIdRef.current = null;

      // v1.8.4: 区分取消错误、ERR_ABORTED 和其他错误
      let errorContent: string;
      const errorMsg = e instanceof Error ? e.message : String(e);

      if (stoppedRef.current) {
        // 用户手动停止 — 保留已生成的内容
        errorContent = fullContent || '已取消生成。';
        streamingMsg.isStreaming = false;
        streamingMsg.content = errorContent;
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...messagesPrefix, streamingMsg] });
      } else if (/abort/i.test(errorMsg)) {
        // ERR_ABORTED — 所有重试均失败
        errorContent = 'AI 服务连接中断，请稍后重试';
        streamingMsg.isStreaming = false;
        streamingMsg.content = errorContent;
        streamingMsg.metadata = {
          error: errorMsg,
          errorCode: 'NETWORK_ERROR',
        };
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...messagesPrefix, streamingMsg] });
      } else {
        // 根据错误类型生成用户友好的提示
        if (errorMsg.includes('spawn') || errorMsg.includes('ENOENT')) {
          errorContent = 'AI 服务配置异常，请在设置中检查模型配置';
        } else if (errorMsg.includes('stdout closed')) {
          errorContent = 'AI 服务连接中断，请稍后重试';
        } else {
          errorContent = '抱歉，发送消息失败，请检查网络连接或稍后重试。';
        }
        streamingMsg.isStreaming = false;
        streamingMsg.content = errorContent;
        streamingMsg.metadata = {
          error: errorMsg,
          errorCode: 'NETWORK_ERROR',
        };
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...messagesPrefix, streamingMsg] });
      }
    }
    setIsLoading(false);
    isLoadingRef.current = false;
    abortControllerRef.current = null;
    setInputValue('');
  }, []);

  /** v1.7.0: 重置 autoRetriedRef（切换会话或新对话时调用） */
  const resetAutoRetry = useCallback(() => {
    autoRetriedRef.current = false;
  }, []);

  return { isLoading, inputValue, setInputValue, sendMessage, stopGeneration, resetAutoRetry };
}
