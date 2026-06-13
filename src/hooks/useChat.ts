import { useState, useCallback, useRef, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, ReferencedSession, Session, ToolCallInfo, Attachment } from '../types/chat';
import type { InventoryQueryPayload, QueryResult, DataSourceType } from '../types/inventory-query';
import { CHAT_API_URL, INVENTORY_QUERY_API_URL } from '../constants/api';
import { useAppSettings } from '../contexts/AppSettingsContext';
import { useToolPermission } from '../contexts/ToolPermissionContext';

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
}

/** inventory_query JSON 块正则 */
const QUERY_BLOCK_REGEX = /```inventory_query\s*\n([\s\S]*?)\n```/;

export function useChat(currentSession: Session | undefined, onSessionUpdate: (session: Session) => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const { updateSettings, settings } = useAppSettings();
  const { requestPermission } = useToolPermission();
  /** v1.7.0: 每个会话级别限制一次 SQL 失败自动重试 */
  const autoRetriedRef = useRef<boolean>(false);
  /** v1.8.0: AbortController 用于中断请求 */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** v1.8.0: 当前正在流式输出的消息 ID */
  const streamingMsgIdRef = useRef<string | null>(null);
  /** v1.8.1: 使用 ref 存储 session 和 callback，避免引用变化导致 sendMessage 重新创建 */
  const sessionRef = useRef<Session | undefined>(currentSession);
  const onSessionUpdateRef = useRef<(session: Session) => void>(onSessionUpdate);
  const isLoadingRef = useRef<boolean>(isLoading);
  /** v1.9.2: 使用 ref 保存最新的 settings，避免 sendMessage 闭包中引用旧值 */
  const settingsRef = useRef(settings);
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
    settingsRef.current = settings;
  }, [settings]);

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
      // v1.8.5: 使用 XHR 代替 fetch，避免 Electron browserView 的 ERR_ABORTED 问题
      const fullContent = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${CHAT_API_URL}?_t=${Date.now()}`, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Cache-Control', 'no-cache');
        xhr.responseType = 'text';

        let result = '';
        let lastIndex = 0;
        let settled = false;

        xhr.onreadystatechange = () => {
          if (xhr.readyState >= 3) {
            const newData = xhr.responseText.substring(lastIndex);
            lastIndex = xhr.responseText.length;
            const lines = newData.split('\n');
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.type === 'text') result += data.content;
                } catch { /* parse error */ }
              }
            }
          }
          if (xhr.readyState === 4 && !settled) {
            settled = true;
            resolve(result);
          }
        };
        xhr.onerror = () => {
          if (!settled) { settled = true; reject(new Error('net::ERR_ABORTED')); }
        };
        xhr.onabort = () => {
          if (!settled) { settled = true; reject(new Error('net::ERR_ABORTED')); }
        };
        xhr.send(JSON.stringify({
          sessionId: session.id,
          message: correctionMessage,
          model: session.model,
          skillId: 'builtin-inventory-query',
        }));
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
      console.error('[useChat] Auto-retry failed:', e);
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

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date(),
      referencedSessions: options?.referencedSessions,
      attachments: options?.attachments,
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

    // v1.8.4: 声明在外层 try 之前，使 catch 块也能访问
    let fullContent = '';

    try {
      // 优先使用 options.model，否则使用 session.model
      const effectiveModel = options?.model || session.model;

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

      // v1.8.4: 使用 XMLHttpRequest 代替 fetch，避免 Electron browserView 的 ERR_ABORTED 问题。
      // XHR 的 readyState + onprogress 模式在 Electron 中更稳定。
      const MAX_RETRIES = 2;
      let currentAutoReason: string | undefined;
      let currentAutoReasonType: string | undefined;
      let currentErrorCode: string | null = null;
      let currentErrorMessage: string | null = null;
      let currentThinkingDuration: number | undefined;
      let currentThinkingType: 'deep' | 'local' = 'deep';

      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          const sseResult = await new Promise<{ content: string; autoReason?: string; autoReasonType?: string; errorCode: string | null; errorMessage: string | null; thinkingDuration?: number }>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${CHAT_API_URL}?_t=${Date.now()}`, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Cache-Control', 'no-cache');
            xhr.setRequestHeader('Pragma', 'no-cache');
            xhr.responseType = 'text';

            let result = '';
            let autoReason: string | undefined;
            let autoReasonType: string | undefined;
            let errorCode: string | null = null;
            let errorMessage: string | null = null;
            let thinkingDuration: number | undefined;
            let lastIndex = 0;
            let settled = false; // 防止 resolve/reject 多次调用

            // v1.9.3: 平滑渲染队列 — 解决 XHR 缓冲导致文字突然跳出的问题
            let pendingContent = '';
            let displayedContent = '';
            let renderTimer: ReturnType<typeof setTimeout> | null = null;
            const BASE_CHUNK_SIZE = 6;  // 基础每次渲染字符数
            const RENDER_INTERVAL = 20;  // 渲染间隔 ms

            const flushRender = () => {
              if (pendingContent.length === 0) {
                renderTimer = null;
                return;
              }
              // 自适应速度：pending 越多，每次渲染越多（加速追赶）
              const adaptiveChunk = Math.min(
                Math.max(BASE_CHUNK_SIZE, Math.ceil(pendingContent.length / 15)),
                pendingContent.length
              );
              const chunk = pendingContent.slice(0, adaptiveChunk);
              pendingContent = pendingContent.slice(adaptiveChunk);
              displayedContent += chunk;
              // v1.9.3: 只更新 streamingMsg.content，不修改 fullContent
              streamingMsg.content = displayedContent;
              onSessionUpdateRef.current({
                ...sessionWithStreaming,
                messages: [
                  ...sessionWithStreaming.messages.slice(0, -1),
                  { ...streamingMsg, content: displayedContent },
                ],
              });
              if (pendingContent.length > 0) {
                renderTimer = setTimeout(flushRender, RENDER_INTERVAL);
              } else {
                renderTimer = null;
              }
            };

            const scheduleRender = () => {
              if (!renderTimer) {
                renderTimer = setTimeout(flushRender, RENDER_INTERVAL);
              }
            };

            xhr.onreadystatechange = () => {
              if (xhr.readyState >= 3) { // LOADING or DONE
                if (stoppedRef.current) {
                  xhr.abort();
                  return;
                }
                const newData = xhr.responseText.substring(lastIndex);
                lastIndex = xhr.responseText.length;
                // 解析 SSE 数据
                const lines = newData.split('\n');
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6));
                      if (data.type === 'text') {
                        // 防御性过滤：如果收到的内容恰好等于用户消息（且是首个字符），
                        // 可能是后端异常或代理缓存导致的回显，跳过以避免 UI 显示用户消息作为 bot 回复
                        if (result === '' && data.content === content) {
                          continue;
                        }
                        result += data.content;
                        // v1.9.3: 使用平滑渲染队列，避免文字突然跳出
                        pendingContent += data.content;
                        scheduleRender();
                      }
                      if (data.type === 'init') {
                        if (data.autoReason) autoReason = data.autoReason;
                        if (data.autoReasonType) autoReasonType = data.autoReasonType;
                        if (data.reasoningEffort) {
                          streamingMsg.reasoningEffort = data.reasoningEffort;
                        }
                        // 同步后端实际使用的模型名到消息（优先使用 modelName 显示名）
                        if (data.model) {
                          streamingMsg.model = data.modelName || data.model;
                        }
                      }
                      // v1.8.6: 处理 AI 思考过程流式内容
                      if (data.type === 'thinking') {
                        streamingMsg.thinking = (streamingMsg.thinking || '') + data.content;
                        // v1.8.7: 解析思考类型
                        if (data.thinkingType) {
                          streamingMsg.thinkingType = data.thinkingType;
                        }
                        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), { ...streamingMsg }] });
                      }
                      // v1.9.0: 处理工具调用事件（Tool Calling）
                      if (data.type === 'tool_call') {
                        const toolCall: ToolCallInfo = {
                          id: data.toolCallId,
                          name: data.toolName || 'unknown',
                          arguments: data.toolArgs || '{}',
                          result: data.toolResult || '',
                        };
                        streamingMsg.toolCalls = [...(streamingMsg.toolCalls || []), toolCall];

                        // v1.9.1: 处理 app:setBotName 工具 — 自动修改 AI 助手名称
                        if (data.toolName === 'app:setBotName' && data.toolResult) {
                          try {
                            const result = JSON.parse(data.toolResult);
                            if (result.success && result.name) {
                              updateSettings({ appearance: { ...settingsRef.current.appearance, botName: result.name } });
                            }
                          } catch { /* JSON 解析失败，忽略 */ }
                        }

                        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), { ...streamingMsg }] });
                      }
                      // v1.9.3: 处理敏感工具权限请求 — 内联显示在消息中
                      if (data.type === 'permission_request') {
                        streamingMsg.permissionRequest = {
                          reqId: data.reqId,
                          toolName: data.toolName,
                          toolArgs: data.toolArgs,
                        };
                        onSessionUpdateRef.current({
                          ...sessionWithStreaming,
                          messages: [
                            ...sessionWithStreaming.messages.slice(0, -1),
                            { ...streamingMsg },
                          ],
                        });
                      }
                      if (data.type === 'done') {
                        errorCode = data.errorCode ?? null;
                        errorMessage = data.errorMessage ?? null;
                        thinkingDuration = data.thinkingDuration;
                        if (data.thinkingType) {
                          currentThinkingType = data.thinkingType;
                        }
                        if (errorCode && errorMessage) {
                          result = errorMessage;
                          // 同步更新 fullContent，确保错误消息被正确保存
                          fullContent = errorMessage;
                          streamingMsg.content = errorMessage;
                          onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), { ...streamingMsg, content: errorMessage }] });
                        }
                      }
                    } catch { /* parse error */ }
                  }
                }
              }
              if (xhr.readyState === 4 && !settled) {
                settled = true;
                // v1.9.3-fix: 清除渲染计时器，防止 flushRender 在流结束后继续运行并覆盖完整内容
                if (renderTimer) {
                  clearTimeout(renderTimer);
                  renderTimer = null;
                }
                // 立即将剩余内容刷新到 UI — 使用 result（完整内容）一次性同步更新，避免 setTimeout 竞态
                // result 由 SSE text 事件累积得到，是最终完整内容
                pendingContent = '';
                streamingMsg.content = result;
                onSessionUpdateRef.current({
                  ...sessionWithStreaming,
                  messages: [
                    ...sessionWithStreaming.messages.slice(0, -1),
                    { ...streamingMsg, content: result },
                  ],
                });
                // DONE — 无论 status 如何，只要有响应就视为成功（后端总是返回 200）
                resolve({ content: result, autoReason, autoReasonType, errorCode, errorMessage, thinkingDuration });
              }
            };

            xhr.onerror = () => {
              if (settled) return;
              settled = true;
              reject(new Error('net::ERR_ABORTED'));
            };
            xhr.onabort = () => {
              if (settled) return;
              settled = true;
              // 用户手动停止不视为错误
              if (stoppedRef.current) {
                resolve({ content: result, autoReason, autoReasonType, errorCode, errorMessage, thinkingDuration });
              } else {
                reject(new Error('net::ERR_ABORTED'));
              }
            };

            xhr.send(JSON.stringify(body));
          });

          fullContent = sseResult.content;
          currentAutoReason = sseResult.autoReason;
          currentAutoReasonType = sseResult.autoReasonType;
          currentErrorCode = sseResult.errorCode;
          currentErrorMessage = sseResult.errorMessage;
          currentThinkingDuration = sseResult.thinkingDuration;

          // 成功，跳出重试循环
          break;
        } catch (fetchErr) {
          const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
          if (/abort/i.test(errMsg) && attempt < MAX_RETRIES - 1 && !stoppedRef.current) {
            console.warn(`[useChat] XHR ERR_ABORTED (attempt ${attempt + 1}/${MAX_RETRIES}), retrying...`);
            fullContent = '';
            // 重置流式消息内容，避免重试时 UI 显示旧内容
            streamingMsg.content = '';
            streamingMsg.thinking = '';
            onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), { ...streamingMsg, content: '', thinking: '' }] });
            continue;
          }
          throw fetchErr;
        }
      }

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
          fullContent = trimmed.length > 500
            ? `> ⚡ AI 思考过程如下，未生成独立文本回答：\n\n${trimmed.slice(-500)}`
            : `> ⚡ AI 思考过程如下，未生成独立文本回答：\n\n${trimmed}`;
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
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), { ...streamingMsg, metadata: { loading: true } }] });

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
              retryOnSqlFailure(updatedSession, content, apiData, onSessionUpdateRef.current);
              return; // 跳过下方的 onSessionUpdate（已在此处更新）
            }
          } catch (apiErr) {
            // API 调用异常
            console.error('[useChat] inventory_query API error:', apiErr);
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
        })();
      } else {
        // 无 inventory_query JSON 块，直接更新最终消息
        // v1.9.3: 确保 content 是完整的（渲染队列可能还没消化完）
        streamingMsg.content = fullContent;
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), streamingMsg] });
      }

      // v1.7.0: 重置 autoRetried 标记（新对话开始时）
      if (session.messages.length === 0) {
        autoRetriedRef.current = false;
      }
    } catch (e) {
      console.error('[useChat] sendMessage error:', e);
      streamingMsgIdRef.current = null;

      // v1.8.4: 区分取消错误、ERR_ABORTED 和其他错误
      let errorContent: string;
      const errorMsg = e instanceof Error ? e.message : String(e);

      if (stoppedRef.current) {
        // 用户手动停止 — 保留已生成的内容
        errorContent = fullContent || '已取消生成。';
        streamingMsg.isStreaming = false;
        streamingMsg.content = errorContent;
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), streamingMsg] });
      } else if (/abort/i.test(errorMsg)) {
        // ERR_ABORTED — 所有重试均失败
        errorContent = 'AI 服务连接中断，请稍后重试';
        streamingMsg.isStreaming = false;
        streamingMsg.content = errorContent;
        streamingMsg.metadata = {
          error: errorMsg,
          errorCode: 'NETWORK_ERROR',
        };
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), streamingMsg] });
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
        onSessionUpdateRef.current({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), streamingMsg] });
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
