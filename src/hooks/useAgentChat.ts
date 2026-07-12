/**
 * useAgentChat Hook — 100% 基于 OpenClaw 架构设计
 *
 * 核心设计原则（完全复制 OpenClaw）：
 *
 * 1. isReasoning 分离原则：
 *    - 思考块（isReasoning=true）和正文块（isReasoning=false）使用独立的 coalescer
 *    - 思考和正文永远不会在同一个 coalescer buffer 中合并
 *    - 从思考切换到正文时，立即刷新思考 buffer 并开始新的正文块
 *
 * 2. Block Reply Coalescer：
 *    - 每个流有独立的 coalescer（思考/正文）
 *    - minChars / maxChars / idleMs 三级缓冲策略
 *    - 工具调用时强制刷新所有 buffer
 *
 * 3. Assistant Message 生命周期：
 *    - onAssistantMessageStart: 新助手消息开始（思考→正文切换也会触发）
 *    - onReasoningStart: 思考开始
 *    - onReasoningEnd: 思考结束
 *    - 每次切换都意味着新的消息阶段
 *
 * 4. 渲染调度：
 *    - 正文流：高优先级（rAF），保证流畅
 *    - 思考流：独立 coalescer + 低优先级更新
 *    - 两个流完全独立，互不阻塞
 *
 * 解决的问题：
 * - 第一次思考白屏：思考内容立即显示，不等待块缓冲
 * - 第二次思考卡住：思考和正文使用完全独立的状态通道
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Message, Session, Attachment, ReferencedSession } from '../types/chat';
import { API_BASE } from '../constants/api';
import { useAiEngineSettings } from '../contexts/AppSettingsContext';
import { extractTodos, mergeAutoTodos } from '../utils/extractTodos';
import { isWKWebView } from '../utils/env';
import { SSEStreamParser } from '../utils/sse/SSEStreamParser.js';
import { BlockReplyCoalescer } from '../utils/sse/BlockReplyCoalescer.js';
import { RenderScheduler } from '../utils/sse/RenderScheduler.js';

// ===================== 类型定义 =====================

export type AgentEventStream =
  | 'lifecycle'
  | 'assistant'
  | 'tool'
  | 'thinking'
  | 'item'
  | 'error'
  | 'approval'
  | 'command_output'
  | 'patch'
  | 'compaction'
  | 'plan'
  | 'heartbeat'
  | string;

export interface AgentItemEventData {
  itemId: string;
  phase: 'start' | 'update' | 'end';
  kind: 'tool' | 'command' | 'patch' | 'search' | 'analysis' | 'plan' | string;
  title: string;
  status: 'running' | 'completed' | 'failed' | 'blocked';
  name?: string;
  meta?: string;
  toolCallId?: string;
  startedAt?: number;
  endedAt?: number;
  error?: string;
  summary?: string;
  progressText?: string;
  progressPercent?: number;
}

export interface PendingMessage {
  id: string;
  content: string;
  attachments?: Attachment[];
  state: 'queued' | 'sending' | 'failed';
  error?: string;
}

export interface AgentEventPayload {
  runId: string;
  seq: number;
  stream: AgentEventStream;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
}

// ===================== 块缓冲配置 =====================

const TEXT_COALESCER_CONFIG = {
  minChars: 120,
  maxChars: 500,
  idleMs: 100,
};

const REASONING_COALESCER_CONFIG = {
  minChars: 80,
  maxChars: 300,
  idleMs: 80,
};

// v3.2: WKWebView 专用更大缓冲配置，减少重渲染次数，避免 UI 卡顿
const TEXT_COALESCER_CONFIG_WKWEBVIEW = {
  minChars: 240,
  maxChars: 1000,
  idleMs: 150,
};

const REASONING_COALESCER_CONFIG_WKWEBVIEW = {
  minChars: 160,
  maxChars: 600,
  idleMs: 120,
};

// 单条助手消息的 toolCalls 数组上限：超过则将早期项合并为摘要占位
// 避免长 agentic 循环导致单条消息 toolCalls 数组膨胀到数百条
const MAX_TOOLCALLS_PER_MESSAGE = 50;

// 内存溢出保护阈值（参考 OpenClaw context-manager 设计）
// 单条消息最大字符数：超过则截断并标记，避免单条消息过大导致内存暴涨
const MAX_MESSAGE_CHARS = 200000;
// 消息列表最大条数：超过则从头部移除旧消息，避免长对话内存溢出
const MAX_MESSAGES_COUNT = 200;
// 思考内容最大字符数：超过则截断
const MAX_THINKING_CHARS = 100000;

// ===================== 消息块状态 =====================

/**
 * 消息块状态 — 跟踪当前消息的不同阶段
 *
 * 完全复制 OpenClaw 的设计：
 * - 一个助手回复可以包含多个阶段：思考→工具→思考→正文
 * - 每个阶段有独立的文本缓冲区
 * - 阶段切换时触发相应的事件
 */
interface MessageBlockState {
  assistantMessageIndex: number;
  isReasoning: boolean;
  textAccumulator: string;
  thinkingAccumulator: string;
}

// ===================== Hook 定义 =====================

export interface SendAgentMessageOptions {
  skillContext?: string;
  skillId?: string;
  referencedSessionIds?: string[];
  referencedSessions?: ReferencedSession[];
  model?: string;
  attachments?: Attachment[];
  executionMode?: 'legacy' | 'observer' | 'react' | 'agent';
  queueMode?: 'collect' | 'steer' | 'followup';
  agentId?: string;
  thinkingLevel?: string;
}

export interface UseAgentChatResult {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  currentRunId: string | null;
  activeItems: AgentItemEventData[];
  thinkingText: string;
  hasThinking: boolean;
  pendingMessages: PendingMessage[];
  sendMessage: (content: string, options?: SendAgentMessageOptions) => Promise<void>;
  stopGeneration: () => void;
  clearMessages: () => void;
  appendMessage: (message: Message) => void;
  /** 用外部消息列表重置内部 messages state（用于上滚加载、会话恢复等场景） */
  resetMessages: (messages: Message[]) => void;
  compactSession: (preserveCount?: number) => Promise<{ success: boolean; compressed: boolean; summary?: string }>;
  addPendingMessage: (content: string, options?: SendAgentMessageOptions) => string;
  removePendingMessage: (id: string) => void;
  updatePendingMessage: (id: string, updates: Partial<Pick<PendingMessage, 'state' | 'error'>>) => void;
}

export function useAgentChat(
  currentSession: Session | undefined,
  onSessionUpdate: (session: Session) => void,
  options?: { syncToSession?: boolean },
): UseAgentChatResult {
  const syncToSession = options?.syncToSession ?? true;
  const [messages, setMessages] = useState<Message[]>(currentSession?.messages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [activeItems, setActiveItems] = useState<AgentItemEventData[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const currentPendingMsgIdRef = useRef<string | null>(null);

  // messagesRef 保持最新 messages 引用，供 sendMessage 闭包读取，避免闭包过时
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Bug Fix: 会话切换标志 — 当 currentSession.id 变化时设置，防止 session sync effect
  // 用旧会话的消息调用 onSessionUpdate（race condition: 旧 messages + 新 session）
  const sessionSwitchingRef = useRef(false);

  // AI 引擎设置
  const { settings: aiEngine } = useAiEngineSettings();

  const abortControllerRef = useRef<AbortController | null>(null);
  // 组件卸载标志：用于区分"用户手动停止"和"组件卸载导致的 abort"
  const isUnmountedRef = useRef(false);
  // 惰性初始化：避免每次渲染都创建新 SSEStreamParser 实例（only created once）
  const parserRef = useRef<SSEStreamParser | null>(null);
  if (parserRef.current === null) {
    parserRef.current = new SSEStreamParser();
  }
  const parser = parserRef.current;
  const itemsMapRef = useRef<Map<string, AgentItemEventData>>(new Map());
  const lastSeqRef = useRef<Map<string, number>>(new Map());

  const textCoalescerRef = useRef<BlockReplyCoalescer | null>(null);
  const thinkingCoalescerRef = useRef<BlockReplyCoalescer | null>(null);
  const schedulerRef = useRef<RenderScheduler | null>(null);

  const blockStateRef = useRef<MessageBlockState>({
    assistantMessageIndex: -1,
    isReasoning: false,
    textAccumulator: '',
    thinkingAccumulator: '',
  });

  // 当 session 变化时，同步 messages 并清理残留的流式状态
  useEffect(() => {
    // Bug Fix: 设置切换标志，阻止 session sync effect 用旧消息同步到新会话
    sessionSwitchingRef.current = true;
    // 清理上一个会话的流式状态，避免 seq 比较错误和工具卡片残留
    itemsMapRef.current.clear();
    lastSeqRef.current.clear();

    if (currentSession?.messages) {
      const hasStreamingMessage = currentSession.messages.some(
        (msg) => msg.isStreaming
      );
      // 从 toolCalls 中提取 generatedFiles
      const enrichedMessages = currentSession.messages.map((msg) => {
        if (msg.role !== 'assistant' || !msg.toolCalls || msg.toolCalls.length === 0) {
          return msg;
        }
        if (msg.generatedFiles && msg.generatedFiles.length > 0) {
          return msg; // 已有 generatedFiles，直接使用
        }
        const generatedFiles: Array<{
          fileName: string;
          fileSize: number;
          description?: string;
          downloadUrl: string;
          previewUrl?: string;
          sessionId?: string;
          createdAt?: string;
        }> = [];
        for (const tc of msg.toolCalls) {
          if (tc.name === 'file_generateFile' && tc.result) {
            try {
              const parsed = JSON.parse(tc.result);
              if (parsed.success && parsed.fileName) {
                generatedFiles.push({
                  fileName: parsed.fileName,
                  fileSize: parsed.fileSize || 0,
                  description: parsed.description,
                  downloadUrl: parsed.downloadUrl,
                  previewUrl: parsed.previewUrl,
                  sessionId: parsed.sessionId,
                  createdAt: parsed.createdAt,
                });
              }
            } catch {
              // 解析失败，忽略
            }
          }
        }
        if (generatedFiles.length > 0) {
          return { ...msg, generatedFiles };
        }
        return msg;
      });

      if (hasStreamingMessage) {
        const cleanedMessages = enrichedMessages.map((msg) =>
          msg.isStreaming
            ? {
                ...msg,
                isStreaming: false,
                thinkingDone: !!msg.thinking,
                metadata: {
                  ...msg.metadata,
                  error:
                    (msg.metadata as any)?.error ||
                    (msg.content && msg.content.trim() ? undefined : '请求已中断'),
                  errorCode: (msg.metadata as any)?.errorCode || 'ABORTED',
                },
              }
            : msg
        );
        setMessages(cleanedMessages);
      } else {
        setMessages(enrichedMessages);
      }
    }
  }, [currentSession?.id]);

  const addPendingMessage = useCallback((content: string, options?: SendAgentMessageOptions): string => {
    const pendingId = `pending_${uuidv4().slice(0, 8)}`;
    const pendingMsg: PendingMessage = {
      id: pendingId,
      content,
      attachments: options?.attachments,
      state: 'sending',
    };
    setPendingMessages((prev) => [...prev, pendingMsg]);
    currentPendingMsgIdRef.current = pendingId;
    return pendingId;
  }, []);

  const removePendingMessage = useCallback((id: string) => {
    setPendingMessages((prev) => prev.filter((msg) => msg.id !== id));
    if (currentPendingMsgIdRef.current === id) {
      currentPendingMsgIdRef.current = null;
    }
  }, []);

  const updatePendingMessage = useCallback((id: string, updates: Partial<Pick<PendingMessage, 'state' | 'error'>>) => {
    setPendingMessages((prev) =>
      prev.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg))
    );
  }, []);

  // 初始化 coalescer 和 scheduler
  const initializeStreaming = useCallback(() => {
    textCoalescerRef.current?.dispose();
    thinkingCoalescerRef.current?.dispose();
    schedulerRef.current?.dispose();

    blockStateRef.current = {
      assistantMessageIndex: -1,
      isReasoning: false,
      textAccumulator: '',
      thinkingAccumulator: '',
    };

    const flushText = (text: string, isReasoning: boolean) => {
      const state = blockStateRef.current;
      if (isReasoning) {
        // 内存保护：思考内容超过上限时截断
        if (state.thinkingAccumulator.length < MAX_THINKING_CHARS) {
          const remaining = MAX_THINKING_CHARS - state.thinkingAccumulator.length;
          state.thinkingAccumulator += text.slice(0, remaining);
          if (text.length > remaining) {
            state.thinkingAccumulator += `\n\n[思考内容已截断，超出 ${text.length - remaining} 字符]`;
          }
        }
        schedulerRef.current?.scheduleThinkingUpdate();
      } else {
        // 内存保护：正文内容超过上限时截断
        if (state.textAccumulator.length < MAX_MESSAGE_CHARS) {
          const remaining = MAX_MESSAGE_CHARS - state.textAccumulator.length;
          state.textAccumulator += text.slice(0, remaining);
          if (text.length > remaining) {
            state.textAccumulator += `\n\n[内容已截断，超出 ${text.length - remaining} 字符]`;
          }
        }
        schedulerRef.current?.scheduleTextUpdate();
      }
    };

    // v3.2: WKWebView 环境使用更大的缓冲配置，减少重渲染
    const textConfig = isWKWebView() ? TEXT_COALESCER_CONFIG_WKWEBVIEW : TEXT_COALESCER_CONFIG;
    const reasoningConfig = isWKWebView() ? REASONING_COALESCER_CONFIG_WKWEBVIEW : REASONING_COALESCER_CONFIG;

    textCoalescerRef.current = new BlockReplyCoalescer(
      textConfig,
      (text) => flushText(text, false),
    );

    thinkingCoalescerRef.current = new BlockReplyCoalescer(
      reasoningConfig,
      (text) => flushText(text, true),
    );

    const applyTextUpdate = () => {
      const state = blockStateRef.current;
      if (state.assistantMessageIndex < 0) return;

      setMessages((prev) => {
        if (state.assistantMessageIndex >= prev.length) return prev;
        const msg = prev[state.assistantMessageIndex];
        if (msg.role !== 'assistant') return prev;

        const updated: Message = {
          ...msg,
          content: state.textAccumulator,
        };

        const newMessages = [...prev];
        newMessages[state.assistantMessageIndex] = updated;
        return newMessages;
      });
    };

    const applyThinkingUpdate = () => {
      const state = blockStateRef.current;
      if (state.assistantMessageIndex < 0) return;

      setMessages((prev) => {
        if (state.assistantMessageIndex >= prev.length) return prev;
        const msg = prev[state.assistantMessageIndex];
        if (msg.role !== 'assistant') return prev;

        const updated: Message = {
          ...msg,
          thinking: state.thinkingAccumulator,
          thinkingDone: state.thinkingAccumulator.length > 0,
        };

        const newMessages = [...prev];
        newMessages[state.assistantMessageIndex] = updated;
        return newMessages;
      });
    };

    schedulerRef.current = new RenderScheduler(applyTextUpdate, applyThinkingUpdate);
  }, []);

  // 开始新的助手消息
  const startAssistantMessage = useCallback((isReasoning: boolean = false) => {
    const state = blockStateRef.current;

    if (state.assistantMessageIndex >= 0) {
      textCoalescerRef.current?.flush({ force: true });
      thinkingCoalescerRef.current?.flush({ force: true });
      schedulerRef.current?.flushAll();
      return;
    }

    // 立即标记，防止同一帧内多个 SSE 事件重复创建 assistant 消息
    state.assistantMessageIndex = -2; // -2 表示"正在创建中"

    setMessages((prev) => {
      const newMsg: Message = {
        id: `msg_${uuidv4().slice(0, 8)}`,
        role: 'assistant',
        content: '',
        model: currentSession?.model || '',
        timestamp: new Date(),
        thinking: '',
        thinkingDone: false,
        isStreaming: true,
      };

      // 内存保护：消息数超过上限时，从头部移除旧消息（保留最近的消息）
      let baseMessages = prev;
      if (prev.length >= MAX_MESSAGES_COUNT) {
        const removeCount = prev.length - MAX_MESSAGES_COUNT + 1;
        baseMessages = prev.slice(removeCount);
      }

      const newMessages = [...baseMessages, newMsg];
      state.assistantMessageIndex = newMessages.length - 1;
      state.isReasoning = isReasoning;
      state.textAccumulator = '';
      state.thinkingAccumulator = '';
      return newMessages;
    });
  }, [currentSession?.model]);

  // 处理文本内容
  const handleTextContent = useCallback((content: string, isReasoning: boolean) => {
    const state = blockStateRef.current;

    if (state.assistantMessageIndex === -1) {
      startAssistantMessage(isReasoning);
    }

    if (isReasoning !== state.isReasoning) {
      textCoalescerRef.current?.flush({ force: true });
      thinkingCoalescerRef.current?.flush({ force: true });
      schedulerRef.current?.flushAll();
      state.isReasoning = isReasoning;
    }

    if (isReasoning) {
      thinkingCoalescerRef.current?.enqueue(content, true);
    } else {
      textCoalescerRef.current?.enqueue(content, false);
    }
  }, [startAssistantMessage]);

  // 工具调用时强制刷新
  const flushAllBuffers = useCallback(() => {
    textCoalescerRef.current?.flush({ force: true });
    thinkingCoalescerRef.current?.flush({ force: true });
    schedulerRef.current?.flushAll();
  }, []);

  // 序列号检查
  const checkAndUpdateSeq = useCallback((stream: string, seq: number): boolean => {
    const lastSeq = lastSeqRef.current.get(stream) ?? 0;
    if (seq > 0 && seq <= lastSeq) {
      return false;
    }
    lastSeqRef.current.set(stream, seq);
    return true;
  }, []);

  // 事件处理 — 处理 AgentEventPayload 格式
  const handleAgentEvent = useCallback((event: { event?: string; data: unknown }) => {
    const payload = (event.data as Record<string, unknown>) || {};
    const stream = (payload.stream as string) || (event.event as string) || 'unknown';
    const seq = (payload.seq as number) || 0;
    const data = (payload.data as Record<string, unknown>) || {};
    const runId = (payload.runId as string) || '';

    if (seq > 0 && !checkAndUpdateSeq(stream, seq)) {
      return;
    }

    switch (stream) {
      case 'lifecycle': {
        const phase = (data.phase as string) || '';
        if (phase === 'start') {
          if (runId) {
            setCurrentRunId(runId);
          }
          setError(null);
          lastSeqRef.current.clear();
          itemsMapRef.current.clear();
          setActiveItems([]);
          initializeStreaming();
        } else if (phase === 'init') {
          if (runId) {
            setCurrentRunId(runId);
          }
          setError(null);

          // 无论是否有 model 信息，都应创建 assistant 消息气泡
          // 确保用户在 AI 思考期间就能看到回复占位
          const state = blockStateRef.current;
          if (state.assistantMessageIndex === -1) {
            startAssistantMessage(false);
          }
          // 如果有 model 信息，更新已创建消息的 model 字段
          if (data.modelName || data.model) {
            setMessages((prev) => {
              const idx = blockStateRef.current.assistantMessageIndex;
              if (idx < 0 || idx >= prev.length) return prev;
              const msg = prev[idx];
              if (msg.role !== 'assistant') return prev;
              const updated: Message = {
                ...msg,
                model: (data.modelName as string) || (data.model as string) || msg.model,
              };
              const newMessages = [...prev];
              newMessages[idx] = updated;
              return newMessages;
            });
          }

          // 读取自动路由透明度：autoReason / autoReasonType / 语义融合方法 / 置信度
          // 主聊天路径此前漏读这些字段（BotMessageContent 有渲染但从未填充），本次补齐
          if (data.autoReason || data.autoReasonType || data.autoSemanticMethod || typeof data.autoSemanticConfidence === 'number') {
            setMessages((prev) => {
              const idx = blockStateRef.current.assistantMessageIndex;
              if (idx < 0 || idx >= prev.length) return prev;
              const msg = prev[idx];
              if (msg.role !== 'assistant') return prev;
              const updated: Message = {
                ...msg,
                ...(data.autoReason ? { autoReason: data.autoReason as string } : {}),
                ...(data.autoReasonType ? { autoReasonType: data.autoReasonType as Message['autoReasonType'] } : {}),
                ...(data.autoSemanticMethod ? { autoSemanticMethod: data.autoSemanticMethod as string } : {}),
                ...(typeof data.autoSemanticConfidence === 'number' ? { autoSemanticConfidence: data.autoSemanticConfidence } : {}),
              };
              const newMessages = [...prev];
              newMessages[idx] = updated;
              return newMessages;
            });
          }
        } else if (phase === 'done') {
          flushAllBuffers();
          textCoalescerRef.current?.dispose();
          thinkingCoalescerRef.current?.dispose();
          schedulerRef.current?.dispose();

          const state = blockStateRef.current;
          if (state.assistantMessageIndex >= 0) {
            setMessages((prev) => {
              if (state.assistantMessageIndex >= prev.length) return prev;
              const msg = prev[state.assistantMessageIndex];
              if (msg.role !== 'assistant') return prev;

              const updated: Message = {
                ...msg,
                isStreaming: false,
                thinkingDone: true,
                thinkingDuration: data.thinkingDuration as number | undefined,
                usage: data.usage as Record<string, unknown> | undefined,
                // 读取降级信息：fallbackModel / fallbackReason
                ...(data.fallbackModel ? { fallbackModel: data.fallbackModel as string } : {}),
                ...(data.fallbackReason ? { fallbackReason: data.fallbackReason as 'key_rotation' | 'model_downgrade' | 'model_not_supported' | 'request_failed' } : {}),
              };

              const newMessages = [...prev];
              newMessages[state.assistantMessageIndex] = updated;
              return newMessages;
            });
          } else if (state.assistantMessageIndex === -1) {
            // 兜底：整个流程未创建 assistant 消息（后端未发送任何文本/思考内容）
            // 创建一条空 assistant 消息，避免用户看到无限 loading 却无回复气泡
            const fallbackContent = (data.errorMessage as string) || '';
            const newMsg: Message = {
              id: `msg_${uuidv4().slice(0, 8)}`,
              role: 'assistant',
              content: fallbackContent || '（未收到 AI 回复内容，可能模型未返回数据或请求异常）',
              model: currentSession?.model || '',
              timestamp: new Date(),
              thinking: '',
              thinkingDone: true,
              isStreaming: false,
              ...(data.fallbackModel ? { fallbackModel: data.fallbackModel as string } : {}),
              ...(data.fallbackReason ? { fallbackReason: data.fallbackReason as 'key_rotation' | 'model_downgrade' | 'model_not_supported' | 'request_failed' } : {}),
              ...(fallbackContent ? { error: fallbackContent } : {}),
            };
            setMessages((prev) => [...prev, newMsg]);
            state.assistantMessageIndex = -1; // 保持 -1，表示已处理兜底
          }

          setIsLoading(false);
          setCurrentRunId(null);

          // 自动提取待办：从助手最终回复内容中提取行动项，写入 localStorage 并派发事件
          // v3.1: 移出 setMessages updater — 不在 state updater 中做副作用，避免阻塞渲染
          const eventSessionKey = (data.sessionKey as string) || (data.sessionId as string) || '';
          if (eventSessionKey && state.assistantMessageIndex >= 0) {
            // 延迟到下一帧执行，不阻塞当前渲染周期（setTimeout 16ms 替代 rAF，WKWebView 兼容）
            window.setTimeout(() => {
              try {
                const idx = state.assistantMessageIndex;
                const finalMsg = messagesRef.current[idx];
                if (!finalMsg || finalMsg.role !== 'assistant' || !finalMsg.content) return;

                const extracted = extractTodos(finalMsg.content);
                if (extracted.length === 0) return;

                const storageKey = `cdf-todos-${eventSessionKey}`;
                const raw = localStorage.getItem(storageKey);
                let existing: Array<{ id: string; text: string; done: boolean; createdAt: number }> = [];
                if (raw) {
                  try {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) existing = parsed;
                  } catch {
                    // 忽略解析失败
                  }
                }
                const merged = mergeAutoTodos(existing, extracted);
                if (merged.length === existing.length) return; // 无新增

                localStorage.setItem(storageKey, JSON.stringify(merged));
                window.dispatchEvent(new CustomEvent('cdf-todos-updated', {
                  detail: { sessionKey: eventSessionKey },
                }));
              } catch {
                // 待办提取失败不影响主流程
              }
            });
          }

          const errorCode = data.errorCode as string | undefined;
          const errorMessage = data.errorMessage as string | undefined;
          if (errorCode && errorMessage) {
            setError(errorMessage);
            if (currentPendingMsgIdRef.current) {
              updatePendingMessage(currentPendingMsgIdRef.current, { state: 'failed', error: errorMessage });
            }
          } else {
            setError(null);
            if (currentPendingMsgIdRef.current) {
              removePendingMessage(currentPendingMsgIdRef.current);
            }
          }
        }
        break;
      }

      case 'assistant': {
        const content = (data.content as string) || '';
        handleTextContent(content, false);
        break;
      }

      case 'thinking': {
        const content = (data.content as string) || '';
        handleTextContent(content, true);

        // v9.0: 处理 thinkingSignature / redacted 字段，保存到当前 assistant 消息的 metadata
        const thinkingSignature = data.thinkingSignature as string | undefined;
        const redacted = data.redacted as boolean | undefined;
        if (thinkingSignature !== undefined || redacted !== undefined) {
          const sigState = blockStateRef.current;
          if (sigState.assistantMessageIndex >= 0) {
            setMessages((prev) => {
              if (sigState.assistantMessageIndex >= prev.length) return prev;
              const msg = prev[sigState.assistantMessageIndex];
              if (msg.role !== 'assistant') return prev;
              const updated: Message = {
                ...msg,
                metadata: {
                  ...msg.metadata,
                  ...(thinkingSignature !== undefined ? { thinkingSignature } : {}),
                  ...(redacted !== undefined ? { thinkingRedacted: redacted } : {}),
                },
              };
              const newMessages = [...prev];
              newMessages[sigState.assistantMessageIndex] = updated;
              return newMessages;
            });
          }
        }
        break;
      }

      case 'tool': {
        flushAllBuffers();

        const toolName = (data.name as string) || (data.toolName as string) || '';
        const toolArgs = (data.args as string) || (data.toolArgs as string) || '{}';
        const toolResult = (data.result as string) || '';

        const state = blockStateRef.current;
        if (state.assistantMessageIndex === -1) {
          startAssistantMessage(false);
        }

        setMessages((prev) => {
          const idx = blockStateRef.current.assistantMessageIndex;
          if (idx < 0 || idx >= prev.length) return prev;
          const lastMsg = prev[idx];
          if (lastMsg.role !== 'assistant') return prev;

          const toolCalls = lastMsg.toolCalls || [];
          const newEntry = {
            id: (data.toolCallId as string) || `tc_${Date.now()}`,
            name: toolName,
            arguments: toolArgs,
            result: toolResult,
            status: toolResult ? 'completed' as const : 'calling' as const,
          };

          // 提取 file_generateFile 工具的结果到 generatedFiles
          const newGeneratedFiles = lastMsg.generatedFiles ? [...lastMsg.generatedFiles] : [];
          if (toolName === 'file_generateFile' && toolResult) {
            try {
              const parsed = JSON.parse(toolResult);
              if (parsed.success && parsed.fileName) {
                const fileInfo = {
                  fileName: parsed.fileName,
                  fileSize: parsed.fileSize || 0,
                  description: parsed.description,
                  downloadUrl: parsed.downloadUrl,
                  previewUrl: parsed.previewUrl,
                  sessionId: parsed.sessionId,
                  createdAt: new Date().toISOString(),
                };
                // 避免重复添加
                const exists = newGeneratedFiles.some(f => f.fileName === fileInfo.fileName);
                if (!exists) {
                  newGeneratedFiles.push(fileInfo);
                }
              }
            } catch {
              // 解析失败，忽略
            }
          }

          // 上限保护：超过 MAX_TOOLCALLS_PER_MESSAGE 时，将最早的项合并为摘要占位
          // 保留最近 MAX_TOOLCALLS_PER_MESSAGE - 1 条 + 1 个摘要位
          let newToolCalls: unknown[];
          if (toolCalls.length + 1 > MAX_TOOLCALLS_PER_MESSAGE) {
            const keepCount = MAX_TOOLCALLS_PER_MESSAGE - 1;
            const dropped = toolCalls.length - keepCount + 1; // 包含本次新增
            const kept = toolCalls.slice(-keepCount);
            const summaryEntry = {
              id: `tc_summary_${Date.now()}`,
              name: '__summary__',
              arguments: '{}',
              result: `[前 ${dropped} 次工具调用已折叠，包含: ${toolCalls.slice(0, dropped).map((tc: any) => tc?.name || 'unknown').join(', ')}]`,
              status: 'completed' as const,
              _folded: true,
            };
            newToolCalls = [summaryEntry, ...kept, newEntry];
          } else {
            newToolCalls = [...toolCalls, newEntry];
          }

          const updated: Message = {
            ...lastMsg,
            toolCalls: newToolCalls as Message['toolCalls'],
            generatedFiles: newGeneratedFiles.length > 0 ? newGeneratedFiles : lastMsg.generatedFiles,
          };

          const newMessages = [...prev];
          newMessages[idx] = updated;
          return newMessages;
        });
        break;
      }

      case 'error': {
        flushAllBuffers();
        const errorMsg = (data.message as string) || (data.error as string) || '发生错误';
        setError(errorMsg);
        setIsLoading(false);
        setCurrentRunId(null);

        // 如果 assistant 消息已创建，将错误信息写入消息内容
        const state = blockStateRef.current;
        if (state.assistantMessageIndex >= 0) {
          setMessages((prev) => {
            if (state.assistantMessageIndex < 0 || state.assistantMessageIndex >= prev.length) return prev;
            const msg = prev[state.assistantMessageIndex];
            if (msg.role !== 'assistant') return prev;
            // 如果消息内容为空，写入错误信息
            if (!msg.content) {
              const updated = [...prev];
              updated[state.assistantMessageIndex] = {
                ...msg,
                content: `⚠️ ${errorMsg}`,
                isStreaming: false,
                error: errorMsg,
              };
              return updated;
            }
            // 内容不为空，仅标记结束
            const updated = [...prev];
            updated[state.assistantMessageIndex] = {
              ...msg,
              isStreaming: false,
              error: errorMsg,
            };
            return updated;
          });
        } else {
          // assistant 消息未创建，创建一条错误消息
          setMessages((prev) => {
            const newMsg: Message = {
              id: `msg_${uuidv4().slice(0, 8)}`,
              role: 'assistant',
              content: `⚠️ ${errorMsg}`,
              model: currentSession?.model || '',
              timestamp: new Date(),
              thinking: '',
              thinkingDone: false,
              isStreaming: false,
              error: errorMsg,
            };
            return [...prev, newMsg];
          });
          state.assistantMessageIndex = -1;
        }

        if (currentPendingMsgIdRef.current) {
          updatePendingMessage(currentPendingMsgIdRef.current, { state: 'failed', error: errorMsg });
        }
        break;
      }

      case 'item':
      case 'debug': {
        const itemData = data as unknown as AgentItemEventData & { phase: string; stream: string };
        const itemId = itemData.itemId;
        if (!itemId) break;

        if (itemData.phase === 'start' || itemData.phase === 'update') {
          itemsMapRef.current.set(itemId, {
            itemId: itemData.itemId,
            phase: itemData.phase,
            kind: itemData.kind,
            title: itemData.title,
            status: itemData.status,
            name: itemData.name,
            meta: itemData.meta,
            toolCallId: itemData.toolCallId,
            startedAt: itemData.startedAt,
            endedAt: itemData.endedAt,
            error: itemData.error,
            summary: itemData.summary,
            progressText: itemData.progressText,
            progressPercent: itemData.progressPercent,
          });
          setActiveItems(Array.from(itemsMapRef.current.values()));
        } else if (itemData.phase === 'end') {
          const existing = itemsMapRef.current.get(itemId);
          if (existing) {
            itemsMapRef.current.set(itemId, { ...existing, ...itemData });
            setActiveItems(Array.from(itemsMapRef.current.values()));
            setTimeout(() => {
              itemsMapRef.current.delete(itemId);
              setActiveItems(Array.from(itemsMapRef.current.values()));
            }, 2000);
          }
        }
        break;
      }

      case 'approval': {
        // 处理审批请求事件
        flushAllBuffers();

        const approvalData = {
          requestId: (data.requestId as string) || `appr_${Date.now()}`,
          type: (data.type as string) || 'tool_call',
          description: (data.description as string) || '',
          toolName: (data.toolName as string) || undefined,
          command: (data.command as string) || undefined,
          filePath: (data.filePath as string) || undefined,
          details: (data.details as Record<string, unknown>) || {},
          riskLevel: (data.riskLevel as string) || undefined,
          reason: (data.reason as string) || undefined,
          timeout: (data.timeout as number) || 30000,
          expiresAt: (data.expiresAt as number) || undefined,
        };

        // 发送全局审批事件
        window.dispatchEvent(new CustomEvent('approval_event', { detail: approvalData }));

        break;
      }

      case 'compaction': {
        // 上下文压缩事件：将后端 tokensBefore/tokensAfter/reductionRatio
        // 映射到 Message.contextCompressed（ContextCompressedData）
        const tokensBefore = (data.tokensBefore as number) ?? 0;
        const tokensAfter = (data.tokensAfter as number) ?? 0;
        const reductionRatio = (data.reductionRatio as number) ?? 0;

        const state = blockStateRef.current;
        if (state.assistantMessageIndex >= 0) {
          setMessages((prev) => {
            if (state.assistantMessageIndex >= prev.length) return prev;
            const msg = prev[state.assistantMessageIndex];
            if (msg.role !== 'assistant') return prev;

            const updated: Message = {
              ...msg,
              contextCompressed: {
                // 后端 compressContextWithSummary 是基于摘要的语义压缩
                strategy: 'semantic',
                originalTokens: tokensBefore,
                compressedTokens: tokensAfter,
                ratio: reductionRatio,
              },
            };

            const newMessages = [...prev];
            newMessages[state.assistantMessageIndex] = updated;
            return newMessages;
          });
        }
        break;
      }

      case 'react_phase': {
        // v4.0: ReAct 阶段事件 — 写入 msg.reactPhase 驱动 ReactPhaseIndicator
        const phase = (data.phase as 'reasoning' | 'acting' | 'observing' | 'reflecting' | 'done') || 'reasoning';
        const state = blockStateRef.current;
        if (state.assistantMessageIndex >= 0) {
          setMessages((prev) => {
            if (state.assistantMessageIndex >= prev.length) return prev;
            const msg = prev[state.assistantMessageIndex];
            if (msg.role !== 'assistant') return prev;
            const updated: Message = {
              ...msg,
              reactPhase: {
                phase,
                step: (data.step as number) ?? undefined,
                totalSteps: (data.totalSteps as number) ?? undefined,
                description: (data.description as string) ?? undefined,
              },
            };
            const newMessages = [...prev];
            newMessages[state.assistantMessageIndex] = updated;
            return newMessages;
          });
        }
        break;
      }

      case 'budget_exceeded': {
        // v5.0: 预算超出事件 — 写入 msg.budgetExceeded 驱动 BudgetExceededIndicator
        const state = blockStateRef.current;
        if (state.assistantMessageIndex >= 0) {
          setMessages((prev) => {
            if (state.assistantMessageIndex >= prev.length) return prev;
            const msg = prev[state.assistantMessageIndex];
            if (msg.role !== 'assistant') return prev;
            const updated: Message = {
              ...msg,
              budgetExceeded: {
                reason: (data.reason as string) || '',
                consumedTurns: (data.consumedTurns as number) ?? 0,
                consumedTokens: (data.consumedTokens as number) ?? 0,
                maxTurns: (data.maxTurns as number) ?? 0,
                maxTokens: (data.maxTokens as number) ?? 0,
              },
            };
            const newMessages = [...prev];
            newMessages[state.assistantMessageIndex] = updated;
            return newMessages;
          });
        }
        break;
      }

      case 'complexity_assessment': {
        // v5.0: 复杂度评估事件 — 写入 msg.complexityAssessment 驱动 ComplexityAssessmentBadge
        const state = blockStateRef.current;
        if (state.assistantMessageIndex >= 0) {
          setMessages((prev) => {
            if (state.assistantMessageIndex >= prev.length) return prev;
            const msg = prev[state.assistantMessageIndex];
            if (msg.role !== 'assistant') return prev;
            const updated: Message = {
              ...msg,
              complexityAssessment: {
                level: (data.level as 'simple' | 'moderate' | 'complex') || 'moderate',
                estimatedSteps: (data.estimatedSteps as number) ?? 0,
                reason: (data.reason as string) || '',
                recommendedMode: (data.recommendedMode as string) || '',
              },
            };
            const newMessages = [...prev];
            newMessages[state.assistantMessageIndex] = updated;
            return newMessages;
          });
        }
        break;
      }

      case 'heartbeat':
        break;

      case 'plan': {
        // v9.2: 执行计划事件 — 将计划写入当前助手消息的 executionPlan 字段
        const plan = data.plan as { steps?: Array<{ step: number; description: string; status?: string; toolName?: string }> } | undefined;
        if (plan?.steps) {
          const idx = blockStateRef.current.assistantMessageIndex;
          if (idx >= 0) {
            setMessages(prev => {
              if (idx < 0 || idx >= prev.length) return prev;
              const updated = { ...prev[idx] };
              updated.executionPlan = {
                id: String(plan.steps!.length),
                intent: '',
                steps: plan.steps!.map(s => ({
                  step: s.step,
                  description: s.description,
                  status: (s.status as 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped') || 'pending',
                  dependsOn: [],
                  toolName: s.toolName,
                })),
                isDynamic: true,
                createdAt: Date.now().toString(),
              };
              const newMessages = [...prev];
              newMessages[idx] = updated;
              return newMessages;
            });
          }
        }
        break;
      }

      case 'plan_revised': {
        // v9.2: 计划修订事件 — 更新当前助手消息的 executionPlan
        const revised = data.plan as { steps?: Array<{ step: number; description: string; status?: string; toolName?: string }> } | undefined;
        if (revised?.steps) {
          const idx = blockStateRef.current.assistantMessageIndex;
          if (idx >= 0) {
            setMessages(prev => {
              if (idx < 0 || idx >= prev.length) return prev;
              const updated = { ...prev[idx] };
              updated.executionPlan = {
                id: String(Date.now()),
                intent: '',
                steps: revised.steps!.map(s => ({
                  step: s.step,
                  description: s.description,
                  status: (s.status as 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped') || 'pending',
                  dependsOn: [],
                  toolName: s.toolName,
                })),
                isDynamic: true,
                createdAt: Date.now().toString(),
              };
              const newMessages = [...prev];
              newMessages[idx] = updated;
              return newMessages;
            });
          }
        }
        break;
      }

      case 'command_output': {
        // v9.2: 命令输出事件 — 添加到 activeItems 供 UI 展示
        const title = (data.title as string) || '命令输出';
        const output = (data.output as string) || '';
        setActiveItems(prev => [...prev, {
          itemId: `cmd_${Date.now()}`,
          phase: 'end',
          kind: 'command',
          title,
          status: 'completed',
          summary: output,
        }]);
        break;
      }

      case 'patch': {
        // v9.2: 补丁摘要事件 — 添加到 activeItems 供 UI 展示
        const title = (data.title as string) || '代码变更';
        const summary = (data.summary as string) || '';
        const added = (data.added as string[]) || [];
        const modified = (data.modified as string[]) || [];
        const deleted = (data.deleted as string[]) || [];
        setActiveItems(prev => [...prev, {
          itemId: `patch_${Date.now()}`,
          phase: 'end',
          kind: 'patch',
          title,
          status: 'completed',
          summary,
          meta: `+${added.length} ~${modified.length} -${deleted.length}`,
        }]);
        break;
      }

      case 'output_review': {
        const quality = (data.quality as 'A' | 'B' | 'C' | 'D') || 'C';
        const issues = (data.issues as string[]) || [];
        const suggestion = (data.suggestion as string) || '';
        const state = blockStateRef.current;
        if (state.assistantMessageIndex >= 0) {
          setMessages((prev) => {
            if (state.assistantMessageIndex >= prev.length) return prev;
            const msg = prev[state.assistantMessageIndex];
            if (msg.role !== 'assistant') return prev;
            const updated: Message = {
              ...msg,
              outputReview: { quality, issues, suggestion },
            };
            const newMessages = [...prev];
            newMessages[state.assistantMessageIndex] = updated;
            return newMessages;
          });
        }
        break;
      }

      case 'compaction_notification': {
        const notification = data.notification as {
          id: string;
          message: string;
          details: {
            tokensBefore?: number;
            tokensAfter?: number;
            reductionRatio?: number;
            summary?: string;
          };
          timestamp: number;
          read: boolean;
        } | undefined;
        if (notification) {
          const state = blockStateRef.current;
          if (state.assistantMessageIndex >= 0) {
            setMessages((prev) => {
              if (state.assistantMessageIndex >= prev.length) return prev;
              const msg = prev[state.assistantMessageIndex];
              if (msg.role !== 'assistant') return prev;
              const updated: Message = {
                ...msg,
                compactionNotification: {
                  id: notification.id,
                  message: notification.message,
                  tokensBefore: notification.details?.tokensBefore,
                  tokensAfter: notification.details?.tokensAfter,
                  reductionRatio: notification.details?.reductionRatio,
                  summary: notification.details?.summary,
                  timestamp: notification.timestamp,
                  read: false,
                },
              };
              const newMessages = [...prev];
              newMessages[state.assistantMessageIndex] = updated;
              return newMessages;
            });
          }
        }
        break;
      }

      // v11.1: 工具执行开始 — 通知前端工具开始执行
      case 'tool_execution_started': {
        const toolName = (data.toolName as string) || '';
        const originalToolName = (data.originalToolName as string) || undefined;
        const toolCallId = (data.toolCallId as string) || '';

        if (toolName) {
          const state = blockStateRef.current;
          if (state.assistantMessageIndex >= 0) {
            setMessages((prev) => {
              if (state.assistantMessageIndex >= prev.length) return prev;
              const msg = prev[state.assistantMessageIndex];
              if (msg.role !== 'assistant') return prev;
              const updated: Message = {
                ...msg,
                toolExecutionStatus: {
                  ...(msg.toolExecutionStatus || {}),
                  [toolCallId]: {
                    toolName,
                    originalToolName,
                    status: 'running',
                    startTime: Date.now(),
                  },
                },
              };
              const newMessages = [...prev];
              newMessages[state.assistantMessageIndex] = updated;
              return newMessages;
            });
          }
        }
        break;
      }

      // v11.1: 工具执行完成 — 更新执行状态
      case 'tool_execution_completed': {
        const toolName = (data.toolName as string) || '';
        const toolCallId = (data.toolCallId as string) || '';
        const success = (data.success as boolean) ?? true;
        const errorType = (data.errorType as string) || undefined;
        const durationMs = (data.durationMs as number) || 0;
        const retryCount = (data.retryCount as number) || 0;
        const truncated = (data.truncated as boolean) || false;

        if (toolName) {
          const state = blockStateRef.current;
          if (state.assistantMessageIndex >= 0) {
            setMessages((prev) => {
              if (state.assistantMessageIndex >= prev.length) return prev;
              const msg = prev[state.assistantMessageIndex];
              if (msg.role !== 'assistant') return prev;
              const updated: Message = {
                ...msg,
                toolExecutionStatus: {
                  ...(msg.toolExecutionStatus || {}),
                  [toolCallId]: {
                    toolName,
                    status: success ? 'completed' : 'failed',
                    endTime: Date.now(),
                    durationMs,
                    retryCount,
                    truncated,
                    errorType,
                  },
                },
              };
              const newMessages = [...prev];
              newMessages[state.assistantMessageIndex] = updated;
              return newMessages;
            });
          }
        }
        break;
      }

      // v6.0/v11.1: 熔断器触发 — 通知前端工具被熔断
      case 'circuit_breaker_triggered': {
        const toolName = (data.toolName as string) || '';
        const failureCount = (data.failureCount as number) || 0;
        const cbState = (data.state as string) || 'open';
        const alternativeTool = (data.alternativeTool as string) || undefined;

        if (toolName) {
          const state = blockStateRef.current;
          if (state.assistantMessageIndex >= 0) {
            setMessages((prev) => {
              if (state.assistantMessageIndex >= prev.length) return prev;
              const msg = prev[state.assistantMessageIndex];
              if (msg.role !== 'assistant') return prev;
              const circuitBreakerEvents = msg.circuitBreakerEvents || [];
              const updated: Message = {
                ...msg,
                circuitBreakerEvents: [
                  ...circuitBreakerEvents,
                  {
                    toolName,
                    failureCount,
                    state: cbState as 'open' | 'half_open',
                    alternativeTool,
                    timestamp: Date.now(),
                  },
                ],
              };
              const newMessages = [...prev];
              newMessages[state.assistantMessageIndex] = updated;
              return newMessages;
            });
          }
        }
        break;
      }

      default:
        break;
    }
  }, [checkAndUpdateSeq, initializeStreaming, handleTextContent, flushAllBuffers, startAssistantMessage, removePendingMessage, updatePendingMessage]);

  // ===================== SSE 自动重试配置 =====================

  const SSE_MAX_RETRIES = 3;
  const SSE_RETRY_BASE_DELAY_MS = 1000;

  /**
   * WKWebView 兼容：使用 XHR 替代 Fetch ReadableStream
   *
   * 问题：WKWebView 对 fetch + response.body.getReader() 的流式响应支持不完整，
   * POST 请求的 SSE 响应可能被缓冲到整个请求结束才返回，导致流式内容不显示。
   *
   * 解决方案：在 WKWebView 环境下使用 XMLHttpRequest，其 onprogress 事件
   * 在 WKWebView 中能可靠地接收增量数据（responseText 累积式）。
   *
   * v3.2: 添加 30ms 节流，避免 WKWebView 中 onprogress 触发过于频繁
   * 导致大量事件解析和状态更新，造成 UI 卡顿。
   */
  const streamViaXHR = (
    url: string,
    body: string,
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.responseType = 'text';

      let lastProcessedLength = 0;
      let settled = false;

      // v3.2: 节流处理 — WKWebView 中 onprogress 可能触发非常频繁
      const THROTTLE_MS = 30;
      let throttleTimer: ReturnType<typeof setTimeout> | null = null;
      let pendingChunk = '';
      let hasPending = false;

      const flushPending = () => {
        throttleTimer = null;
        if (!hasPending || settled) return;
        hasPending = false;
        if (pendingChunk) {
          onChunk(pendingChunk);
          pendingChunk = '';
        }
      };

      const scheduleFlush = () => {
        if (throttleTimer === null) {
          throttleTimer = setTimeout(flushPending, THROTTLE_MS);
        }
      };

      const cleanup = () => {
        if (throttleTimer) {
          clearTimeout(throttleTimer);
          throttleTimer = null;
        }
        xhr.onprogress = null;
        xhr.onload = null;
        xhr.onerror = null;
        xhr.onreadystatechange = null;
      };

      // abort 信号处理
      const onAbort = () => {
        if (settled) return;
        settled = true;
        xhr.abort();
        cleanup();
        const err = new Error('请求已取消');
        err.name = 'AbortError';
        reject(err);
      };

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort);

      xhr.onprogress = () => {
        if (settled) return;
        // WKWebView 中 responseText 是累积的，取增量部分
        const fullText = xhr.responseText || '';
        if (fullText.length > lastProcessedLength) {
          const chunk = fullText.slice(lastProcessedLength);
          lastProcessedLength = fullText.length;
          // v3.2: 使用节流缓冲，避免频繁调用 onChunk
          pendingChunk += chunk;
          hasPending = true;
          scheduleFlush();
        }
      };

      xhr.onload = () => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);

        // 处理最后一段未消费的数据（立即 flush，不等节流）
        const fullText = xhr.responseText || '';
        if (fullText.length > lastProcessedLength) {
          pendingChunk += fullText.slice(lastProcessedLength);
          lastProcessedLength = fullText.length;
        }

        cleanup();

        // 立即 flush 所有缓冲
        if (pendingChunk) {
          onChunk(pendingChunk);
          pendingChunk = '';
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          let errMsg = `请求失败 (${xhr.status})`;
          try {
            const errorData = JSON.parse(xhr.responseText || '{}');
            errMsg = errorData.error || errMsg;
          } catch { /* ignore parse error */ }
          const err: any = new Error(errMsg);
          err.status = xhr.status;
          reject(err);
        }
      };

      xhr.onerror = () => {
        if (settled) return;
        settled = true;
        signal.removeEventListener('abort', onAbort);
        cleanup();
        const err: any = new Error('网络请求失败');
        reject(err);
      };

      xhr.send(body);
    });
  };

  /**
   * 检测错误是否可重试
   * - 网络断开（fetch failed、ECONNREFUSED、network error）
   * - 超时（Timeout）
   * - 服务器临时不可用（502、503、504）
   * - 不包括：用户取消（AbortError）、业务错误（400、401、403、404）
   */
  const isRetryableError = (err: any): boolean => {
    if (err.name === 'AbortError') return false;

    // 1) HTTP 状态码具有权威性：仅 502/503/504 视为可重试的临时服务端错误。
    //    其余状态码（4xx、500/501/505 等）一律不可重试，避免把"鉴权失败/限流/参数错误"
    //    等永久错误当作网络抖动反复重试，导致"报错→重试"死循环。
    if (typeof err.status === 'number') {
      return err.status === 502 || err.status === 503 || err.status === 504;
    }

    // 2) 无状态码（纯传输层/网络错误）：按中英文消息文本启发式判断
    const msg = err.message?.toLowerCase() || '';
    if (
      msg.includes('fetch failed') || msg.includes('network') || msg.includes('econnrefused') ||
      msg.includes('connect') || msg.includes('网络') || msg.includes('连接') || msg.includes('超时')
    ) return true;
    if (msg.includes('timeout') || msg.includes('timed out')) return true;

    return false;
  };

  // ===================== 发送消息 =====================

  const sendMessage = useCallback(async (
    content: string,
    options: SendAgentMessageOptions = {},
  ): Promise<void> => {
    // console.log('[useAgentChat] sendMessage called, content:', content.slice(0, 50));
    if (!content.trim() || isLoading) return;

    addPendingMessage(content, options);

    const userMsgId = `msg_${uuidv4().slice(0, 8)}`;
    const userMsg: Message = {
      id: userMsgId,
      role: 'user',
      content,
      model: options.model || currentSession?.model || 'auto',
      timestamp: new Date(),
      attachments: options.attachments,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);
    setActiveItems([]);
    itemsMapRef.current.clear();
    lastSeqRef.current.clear();
    parser.reset();

    initializeStreaming();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    let retryCount = 0;

    const conversationHistory = messagesRef.current
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role,
        content: m.content,
        attachments: m.attachments,
      }));

    const executeRequest = async (): Promise<void> => {
      try {
        const requestBody = JSON.stringify({
          sessionId: currentSession?.id,
          message: content,
          model: options.model || currentSession?.model || 'auto',
          attachments: options.attachments,
          skillContext: options.skillContext,
          skillId: options.skillId,
          referencedSessionIds: options.referencedSessionIds,
          executionMode: options.executionMode,
          agentId: options.agentId,
          queueMode: options.queueMode,
          toolProfile: aiEngine.toolProfile,
          compaction: aiEngine.compaction,
          conversationHistory,
          thinkingLevel: options.thinkingLevel,
        });

        const handleChunk = (chunk: string) => {
          const events = parser.feed(chunk);
          for (const event of events) {
            handleAgentEvent(event);
          }
        };

        if (isWKWebView()) {
          // WKWebView 兼容模式：使用 XHR 替代 Fetch ReadableStream
          // WKWebView 对 fetch + getReader() 的流式 POST 响应支持不完整，
          // 会缓冲整个响应到结束才返回，导致 SSE 流式内容不显示。
          // XHR 的 onprogress 能可靠接收增量数据。
          await streamViaXHR(
            `${API_BASE}/agent-chat`,
            requestBody,
            abortController.signal,
            handleChunk,
          );
        } else {
          // 浏览器环境：使用 Fetch ReadableStream（标准方式）
          const response = await fetch(`${API_BASE}/agent-chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: requestBody,
            signal: abortController.signal,
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const err: any = new Error((errorData as any).error || `请求失败 (${response.status})`);
            err.status = response.status;
            throw err;
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('无法读取响应流');
          }

          const decoder = new TextDecoder('utf-8');

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            handleChunk(chunk);
          }
        }

        flushAllBuffers();
        textCoalescerRef.current?.dispose();
        thinkingCoalescerRef.current?.dispose();
        schedulerRef.current?.dispose();

      } catch (err: any) {
        if (err.name === 'AbortError') {
          // console.log('[useAgentChat] 请求已取消');
          flushAllBuffers();
          textCoalescerRef.current?.dispose();
          thinkingCoalescerRef.current?.dispose();
          schedulerRef.current?.dispose();

          // 组件卸载导致的 abort（如路由切换），不更新消息状态，避免显示"请求已取消"错误
          if (isUnmountedRef.current) {
            // console.log('[useAgentChat] 组件已卸载，跳过错误状态更新');
            return;
          }

          const state = blockStateRef.current;
          if (state.assistantMessageIndex >= 0) {
            setMessages((prev) => {
              if (state.assistantMessageIndex >= prev.length) return prev;
              const msg = prev[state.assistantMessageIndex];
              if (msg.role !== 'assistant') return prev;

              const updated: Message = {
                ...msg,
                isStreaming: false,
                thinkingDone: !!msg.thinking,
                metadata: {
                  ...msg.metadata,
                  error: '请求已取消',
                  errorCode: 'ABORTED',
                },
              };

              const newMessages = [...prev];
              newMessages[state.assistantMessageIndex] = updated;
              return newMessages;
            });
          }
          return;
        }

        // 可重试错误：自动重试（最多 3 次，指数退避）
        if (isRetryableError(err) && retryCount < SSE_MAX_RETRIES) {
          retryCount++;
          const delayMs = SSE_RETRY_BASE_DELAY_MS * Math.pow(2, retryCount - 1);
          // console.warn(`[useAgentChat] SSE 连接断开，${delayMs}ms 后自动重试（第 ${retryCount} 次）:`, err.message);

          // 重试前清理上一轮失败产生的"半截"助手消息，避免重试后出现重复气泡；
          // 同时清除错误展示，让下一轮从干净状态开始。
          // 注意：initializeStreaming() 会重置 blockState.assistantMessageIndex = -1，
          // 但已追加到 messages 的残缺助手消息不会自动消失，必须显式过滤。
          setError(null);
          setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && m.isStreaming)));

          // 清理流式状态（重置 parser、seq，避免旧 run 的序列号干扰新 run）
          parser.reset();
          lastSeqRef.current.clear();
          initializeStreaming();

          // 延迟后重试
          await new Promise((r) => setTimeout(r, delayMs));

          // 如果 abortController 已被外部取消，停止重试
          if (abortController.signal.aborted) {
            // console.log('[useAgentChat] 重试期间请求被取消');
            return;
          }

          return executeRequest();
        }

        // 不可重试或重试耗尽：显示错误
        // console.error('[useAgentChat] 发送消息失败:', err);
        setError(err.message || '发送失败');

        flushAllBuffers();
        textCoalescerRef.current?.dispose();
        thinkingCoalescerRef.current?.dispose();
        schedulerRef.current?.dispose();

        const state = blockStateRef.current;
        if (state.assistantMessageIndex >= 0) {
          setMessages((prev) => {
            if (state.assistantMessageIndex >= prev.length) return prev;
            const msg = prev[state.assistantMessageIndex];
            if (msg.role !== 'assistant') return prev;

            const updated: Message = {
              ...msg,
              isStreaming: false,
              thinkingDone: !!msg.thinking,
              metadata: {
                ...msg.metadata,
                error: err.message || '发送失败',
                errorCode: (err as any).code || 'UNKNOWN_ERROR',
              },
            };

            const newMessages = [...prev];
            newMessages[state.assistantMessageIndex] = updated;
            return newMessages;
          });
        }
      }
    };

    await executeRequest();

    setIsLoading(false);
    setCurrentRunId(null);
    abortControllerRef.current = null;
  }, [currentSession, isLoading, initializeStreaming, handleAgentEvent, flushAllBuffers, addPendingMessage, aiEngine]);

  // ===================== 停止生成 =====================

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    flushAllBuffers();
    textCoalescerRef.current?.dispose();
    thinkingCoalescerRef.current?.dispose();
    schedulerRef.current?.dispose();

    const state = blockStateRef.current;
    if (state.assistantMessageIndex >= 0) {
      setMessages((prev) => {
        if (state.assistantMessageIndex >= prev.length) return prev;
        const msg = prev[state.assistantMessageIndex];
        if (msg.role !== 'assistant') return prev;

        const updated: Message = {
          ...msg,
          isStreaming: false,
          thinkingDone: !!msg.thinking,
        };

        const newMessages = [...prev];
        newMessages[state.assistantMessageIndex] = updated;
        return newMessages;
      });
    }

    setIsLoading(false);
    setCurrentRunId(null);
  }, [flushAllBuffers]);

  // ===================== 清空消息 =====================

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setActiveItems([]);
    itemsMapRef.current.clear();
    lastSeqRef.current.clear();
  }, []);

  // ===================== 追加消息 =====================

  const appendMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // ===================== 重置 messages（外部同步） =====================

  /**
   * 用外部消息列表重置内部 messages state
   *
   * 使用场景：
   * - 上滚加载更早消息后，需要把完整消息列表同步到内部 state
   * - 会话恢复、消息编辑等外部修改场景
   *
   * 注意：此函数会清空流式状态，不应在流式输出期间调用。
   */
  const resetMessages = useCallback((newMessages: Message[]) => {
    // 清理流式状态，避免 seq 比较错误
    itemsMapRef.current.clear();
    lastSeqRef.current.clear();
    textCoalescerRef.current?.flush({ force: true });
    thinkingCoalescerRef.current?.flush({ force: true });
    schedulerRef.current?.flushAll();

    blockStateRef.current = {
      assistantMessageIndex: -1,
      isReasoning: false,
      textAccumulator: '',
      thinkingAccumulator: '',
    };

    setMessages(newMessages);
  }, []);

  // ===================== 对话压缩 =====================

  const compactSession = useCallback(async (preserveCount: number = 6): Promise<{ success: boolean; compressed: boolean; summary?: string }> => {
    if (!currentSession?.id) {
      return { success: false, compressed: false };
    }

    if (isLoading) {
      return { success: false, compressed: false };
    }

    try {
      const response = await fetch(`${API_BASE}/agent-compact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: currentSession.id,
          model: currentSession.model || 'auto',
          preserveCount,
        }),
      });

      const data = await response.json();
      if (data.success && data.compressed) {
        const summaryMsg: Message = {
          id: `msg_compact_${Date.now()}`,
          role: 'assistant',
          content: data.summary || '对话已压缩',
          model: currentSession.model || '',
          timestamp: new Date(),
          thinking: '',
          thinkingDone: false,
        };

        const keptMessages = messages.slice(-preserveCount);
        const newMessages = [summaryMsg, ...keptMessages];
        setMessages(newMessages);

        if (currentSession && syncToSession) {
          const updatedSession = {
            ...currentSession,
            messages: newMessages,
            updatedAt: new Date().toISOString(),
          };
          onSessionUpdate(updatedSession);
        }
      }

      return {
        success: data.success,
        compressed: data.compressed,
        summary: data.summary,
      };
    } catch (err) {
      console.error('[useAgentChat] 压缩对话失败:', err);
      return { success: false, compressed: false };
    }
  }, [currentSession, isLoading, messages, onSessionUpdate]);

  // 计算思考文本
  const thinkingText = useMemo(() => {
    const state = blockStateRef.current;
    if (state.assistantMessageIndex >= 0 && state.thinkingAccumulator) {
      return state.thinkingAccumulator;
    }
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.role === 'assistant' && lastMsg.thinking) {
      return lastMsg.thinking;
    }
    return '';
  }, [messages]);

  const hasThinking = useMemo(() => {
    return thinkingText.length > 0;
  }, [thinkingText]);

  // 同步 messages 到 session（节流模式：流式期间每 200ms 同步一次，避免防抖永不触发）
  // v3.1: 流式期间跳过 effect 函数体 — 仅在非流式或定时器触发时同步
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncTimeRef = useRef<number>(0);
  const isStreamingRef = useRef(false);
  useEffect(() => {
    isStreamingRef.current = messages.length > 0 && !!messages[messages.length - 1]?.isStreaming;
  }, [messages]);

  useEffect(() => {
    if (!syncToSession) return;
    // Bug Fix: 会话切换后第一次渲染跳过同步，因为此时 messages 仍是旧会话的消息
    // 旧消息同步到新会话会导致：错误标题、空会话提前出现在侧边栏、历史被覆盖
    if (sessionSwitchingRef.current) {
      sessionSwitchingRef.current = false;
      return;
    }
    if (messages.length > 0 && currentSession) {
      const lastMsg = messages[messages.length - 1];
      const isStreaming = !!lastMsg?.isStreaming;

      if (isStreaming) {
        // 节流：流式期间最多每 200ms 同步一次
        if (syncTimerRef.current) return; // 已有定时器在等待，跳过
        const elapsed = Date.now() - lastSyncTimeRef.current;
        const delay = elapsed >= 200 ? 0 : 200 - elapsed;
        syncTimerRef.current = setTimeout(() => {
          syncTimerRef.current = null;
          lastSyncTimeRef.current = Date.now();
          const updatedSession = {
            ...currentSession,
            messages: messagesRef.current, // 用 ref 读取最新值
            updatedAt: new Date().toISOString(),
          };
          onSessionUpdate(updatedSession);
        }, delay);
        return;
      } else {
        // 非流式立即同步
        if (syncTimerRef.current) {
          clearTimeout(syncTimerRef.current);
          syncTimerRef.current = null;
        }
        const updatedSession = {
          ...currentSession,
          messages,
          updatedAt: new Date().toISOString(),
        };
        onSessionUpdate(updatedSession);
      }
    }
  }, [messages, currentSession, onSessionUpdate, syncToSession]);

  // ===================== 内存压力响应 =====================
  // 监听原生 WKWebView 触发的 cdf-memory-pressure 事件
  // 清理流式缓冲和已完成工具项的 transient 状态，保留 messages/pendingMessages
  useEffect(() => {
    const handleMemoryPressure = () => {
      // 已完成的工具 item 立即清理；运行中的保留以免卡片消失
      const runningOnly = new Map<string, AgentItemEventData>();
      itemsMapRef.current.forEach((item, id) => {
        if (item.status === 'running' || item.status === 'blocked') {
          runningOnly.set(id, item);
        }
      });
      itemsMapRef.current.clear();
      runningOnly.forEach((item, id) => itemsMapRef.current.set(id, item));
      setActiveItems(Array.from(itemsMapRef.current.values()));

      // 非流式状态下，清理 coalescer / scheduler / parser 缓冲
      if (!isLoading) {
        textCoalescerRef.current?.dispose();
        thinkingCoalescerRef.current?.dispose();
        schedulerRef.current?.dispose();
        parser.reset();
        // 清理已结束会话的 seq 记录（保留运行中的 stream seq）
        const streamsToKeep = new Set<string>();
        runningOnly.forEach((item) => {
          if (item.toolCallId) streamsToKeep.add(`tool_${item.toolCallId}`);
        });
        const seqEntries = Array.from(lastSeqRef.current.entries());
        lastSeqRef.current.clear();
        seqEntries.forEach(([k, v]) => {
          if (streamsToKeep.has(k)) lastSeqRef.current.set(k, v);
        });
        // 重置 blockState（仅当没有进行中的 assistant 消息时）
        const state = blockStateRef.current;
        if (state.assistantMessageIndex < 0) {
          state.textAccumulator = '';
          state.thinkingAccumulator = '';
        }
      }

      // 尝试触发 JS 引擎 GC（部分 WKWebView 配置暴露 window.gc）
      try {
        const gc = (window as any).gc;
        if (typeof gc === 'function') gc();
      } catch {}
    };
    window.addEventListener('cdf-memory-pressure', handleMemoryPressure);
    return () => {
      window.removeEventListener('cdf-memory-pressure', handleMemoryPressure);
    };
  }, [isLoading]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 标记组件已卸载，使 catch 块中的 AbortError 处理跳过错误状态更新
      isUnmountedRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      textCoalescerRef.current?.flush({ force: true });
      thinkingCoalescerRef.current?.flush({ force: true });
      schedulerRef.current?.flushAll();
      textCoalescerRef.current?.dispose();
      thinkingCoalescerRef.current?.dispose();
      schedulerRef.current?.dispose();
    };
  }, []);

  return {
    messages,
    isLoading,
    error,
    currentRunId,
    activeItems,
    thinkingText,
    hasThinking,
    pendingMessages,
    sendMessage,
    stopGeneration,
    clearMessages,
    appendMessage,
    resetMessages,
    compactSession,
    addPendingMessage,
    removePendingMessage,
    updatePendingMessage,
  };
}

export default useAgentChat;
