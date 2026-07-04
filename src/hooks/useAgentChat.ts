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

// ===================== SSE 解析器 =====================

/**
 * SSE 流解析器 — 逐行解析，处理跨 chunk 边界
 *
 * 完全复制 OpenClaw 的 robust 解析器设计。
 */
class SSEStreamParser {
  private buffer = '';
  private currentEvent: { event?: string; data: string[] } = { data: [] };

  feed(chunk: string): Array<{ event?: string; data: unknown }> {
    this.buffer += chunk;
    const events: Array<{ event?: string; data: unknown }> = [];

    let lineEnd = this.buffer.indexOf('\n');
    while (lineEnd !== -1) {
      const line = this.buffer.slice(0, lineEnd);
      this.buffer = this.buffer.slice(lineEnd + 1);

      const result = this.processLine(line);
      if (result) {
        events.push(result);
      }

      lineEnd = this.buffer.indexOf('\n');
    }

    return events;
  }

  private processLine(line: string): { event?: string; data: unknown } | null {
    if (line === '') {
      if (this.currentEvent.data.length > 0 || this.currentEvent.event) {
        const event = this.buildEvent();
        this.currentEvent = { data: [] };
        return event;
      }
      return null;
    }

    if (line.startsWith(':')) {
      return null;
    }

    if (line.startsWith('event: ')) {
      this.currentEvent.event = line.slice(7);
      return null;
    }

    if (line.startsWith('data: ')) {
      this.currentEvent.data.push(line.slice(6));
      return null;
    }

    if (line.startsWith('data:')) {
      this.currentEvent.data.push(line.slice(5));
      return null;
    }

    return null;
  }

  private buildEvent(): { event?: string; data: unknown } {
    const dataStr = this.currentEvent.data.join('\n');
    let parsed: unknown = dataStr;

    try {
      parsed = JSON.parse(dataStr);
    } catch {
      // 不是 JSON，保留原始字符串
    }

    return {
      event: this.currentEvent.event,
      data: parsed,
    };
  }

  reset(): void {
    this.buffer = '';
    this.currentEvent = { data: [] };
  }
}

// ===================== Block Reply Coalescer =====================

/**
 * Block Reply Coalescer — 完全复制 OpenClaw 的设计
 *
 * 将多个小的流式片段合并为更少的输出块，减少渲染次数。
 * 特点：
 * - minChars: 达到最小字符数后才开始计时
 * - maxChars: 达到最大字符数立即刷新
 * - idleMs: 空闲时间后刷新
 * - isReasoning: 思考标记，思考和正文不能合并
 */
class BlockReplyCoalescer {
  private bufferText = '';
  private bufferIsReasoning = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private aborted = false;
  private firstChunk = true;

  constructor(
    private config: { minChars: number; maxChars: number; idleMs: number },
    private onFlush: (text: string, isReasoning: boolean) => void,
  ) {}

  enqueue(text: string, isReasoning: boolean): void {
    if (this.aborted) return;
    if (!text) return;

    if (this.firstChunk) {
      this.firstChunk = false;
      this.bufferIsReasoning = isReasoning;
    }

    if (isReasoning !== this.bufferIsReasoning) {
      this.flush({ force: true });
      this.bufferIsReasoning = isReasoning;
    }

    this.bufferText += text;

    if (this.bufferText.length >= this.config.maxChars) {
      this.flush({ force: true });
      return;
    }

    this.scheduleIdleFlush();
  }

  private scheduleIdleFlush(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }

    if (this.bufferText.length < this.config.minChars) {
      this.idleTimer = setTimeout(() => {
        this.flush({ force: false });
      }, this.config.idleMs * 1.5);
    } else {
      this.idleTimer = setTimeout(() => {
        this.flush({ force: false });
      }, this.config.idleMs);
    }
  }

  flush(options?: { force?: boolean }): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.aborted) {
      this.bufferText = '';
      return;
    }

    if (!this.bufferText) {
      return;
    }

    if (!options?.force && this.bufferText.length < this.config.minChars) {
      this.scheduleIdleFlush();
      return;
    }

    const text = this.bufferText;
    const isReasoning = this.bufferIsReasoning;
    this.bufferText = '';

    this.onFlush(text, isReasoning);
  }

  hasBuffered(): boolean {
    return this.bufferText.length > 0;
  }

  stop(): void {
    this.aborted = true;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.bufferText = '';
  }

  dispose(): void {
    this.flush({ force: true });
    this.stop();
  }
}

// ===================== 渲染调度器 =====================

/**
 * 渲染调度器 — 管理不同优先级的 UI 更新
 *
 * 正文流：高优先级 (setTimeout 16ms)
 * 思考流：低优先级 (setTimeout 50ms)
 * 
 * v3.0.0: 统一用 setTimeout 渲染调度 — 彻底消除 rAF 暂停问题
 * 在 WKWebView 中，rAF 会在应用后台或某些状态下暂停，导致 UI 无法更新
 * setTimeout 不受 WKWebView rAF 暂停影响
 */
class RenderScheduler {
  private textRafId: number | null = null;
  private thinkingRicId: number | null = null;
  private pendingText = false;
  private pendingThinking = false;

  constructor(
    private textUpdateFn: () => void,
    private thinkingUpdateFn: () => void,
  ) {}

  scheduleTextUpdate(): void {
    this.pendingText = true;
    if (this.textRafId === null) {
      this.textRafId = window.setTimeout(() => {
        this.textRafId = null;
        if (this.pendingText) {
          this.pendingText = false;
          this.textUpdateFn();
        }
      }, 16) as unknown as number;
    }
  }

  scheduleThinkingUpdate(): void {
    this.pendingThinking = true;
    if (this.thinkingRicId === null) {
      this.thinkingRicId = window.setTimeout(() => {
        this.thinkingRicId = null;
        if (this.pendingThinking) {
          this.pendingThinking = false;
          this.thinkingUpdateFn();
        }
      }, 50) as unknown as number;
    }
  }

  flushAll(): void {
    if (this.pendingText && this.textRafId !== null) {
      clearTimeout(this.textRafId);
      this.textRafId = null;
      this.pendingText = false;
      this.textUpdateFn();
    }
    if (this.pendingThinking && this.thinkingRicId !== null) {
      clearTimeout(this.thinkingRicId);
      this.thinkingRicId = null;
      this.pendingThinking = false;
      this.thinkingUpdateFn();
    }
  }

  dispose(): void {
    if (this.textRafId !== null) {
      clearTimeout(this.textRafId);
      this.textRafId = null;
    }
    if (this.thinkingRicId !== null) {
      clearTimeout(this.thinkingRicId);
      this.thinkingRicId = null;
    }
  }
}

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
  compactSession: (preserveCount?: number) => Promise<{ success: boolean; compressed: boolean; summary?: string }>;
  addPendingMessage: (content: string, options?: SendAgentMessageOptions) => string;
  removePendingMessage: (id: string) => void;
  updatePendingMessage: (id: string, updates: Partial<Pick<PendingMessage, 'state' | 'error'>>) => void;
}

export function useAgentChat(
  currentSession: Session | undefined,
  onSessionUpdate: (session: Session) => void,
): UseAgentChatResult {
  const [messages, setMessages] = useState<Message[]>(currentSession?.messages || []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [activeItems, setActiveItems] = useState<AgentItemEventData[]>([]);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const currentPendingMsgIdRef = useRef<string | null>(null);

  // AI 引擎设置
  const { settings: aiEngine } = useAiEngineSettings();

  const abortControllerRef = useRef<AbortController | null>(null);
  // 组件卸载标志：用于区分"用户手动停止"和"组件卸载导致的 abort"
  const isUnmountedRef = useRef(false);
  const parserRef = useRef<SSEStreamParser>(new SSEStreamParser());
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
    if (currentSession?.messages) {
      const hasStreamingMessage = currentSession.messages.some(
        (msg) => msg.isStreaming
      );
      if (hasStreamingMessage) {
        const cleanedMessages = currentSession.messages.map((msg) =>
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
        setMessages(currentSession.messages);
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
      if (isReasoning) {
        blockStateRef.current.thinkingAccumulator += text;
        schedulerRef.current?.scheduleThinkingUpdate();
      } else {
        blockStateRef.current.textAccumulator += text;
        schedulerRef.current?.scheduleTextUpdate();
      }
    };

    textCoalescerRef.current = new BlockReplyCoalescer(
      TEXT_COALESCER_CONFIG,
      (text) => flushText(text, false),
    );

    thinkingCoalescerRef.current = new BlockReplyCoalescer(
      REASONING_COALESCER_CONFIG,
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

      const newMessages = [...prev, newMsg];
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

          if (data.modelName || data.model) {
            const state = blockStateRef.current;
            if (state.assistantMessageIndex === -1) {
              startAssistantMessage(false);
            }
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
        } else if (phase === 'done') {
          textCoalescerRef.current?.dispose();
          thinkingCoalescerRef.current?.dispose();
          schedulerRef.current?.dispose();
          flushAllBuffers();

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
              };

              const newMessages = [...prev];
              newMessages[state.assistantMessageIndex] = updated;
              return newMessages;
            });
          }

          setIsLoading(false);
          setCurrentRunId(null);

          // 自动提取待办：从助手最终回复内容中提取行动项，写入 localStorage 并派发事件
          const eventSessionKey = (data.sessionKey as string) || (data.sessionId as string) || '';
          if (eventSessionKey && state.assistantMessageIndex >= 0) {
            try {
              setMessages((prev) => {
                if (state.assistantMessageIndex >= prev.length) return prev;
                const finalMsg = prev[state.assistantMessageIndex];
                if (finalMsg?.role !== 'assistant' || !finalMsg.content) return prev;

                const extracted = extractTodos(finalMsg.content);
                if (extracted.length === 0) return prev;

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
                if (merged.length === existing.length) return prev; // 无新增

                localStorage.setItem(storageKey, JSON.stringify(merged));
                // 派发事件通知 ChatSidePanel 重新加载
                window.dispatchEvent(new CustomEvent('cdf-todos-updated', {
                  detail: { sessionKey: eventSessionKey },
                }));
                return prev;
              });
            } catch {
              // 待办提取失败不影响主流程
            }
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
          const newToolCalls = [
            ...toolCalls,
            {
              id: (data.toolCallId as string) || `tc_${Date.now()}`,
              name: toolName,
              arguments: toolArgs,
              result: toolResult,
              status: toolResult ? 'completed' as const : 'calling' as const,
            },
          ];

          const updated: Message = {
            ...lastMsg,
            toolCalls: newToolCalls,
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

      case 'heartbeat':
      case 'compaction':
      case 'plan':
      case 'command_output':
      case 'patch':
      default:
        break;
    }
  }, [checkAndUpdateSeq, initializeStreaming, handleTextContent, flushAllBuffers, startAssistantMessage, removePendingMessage, updatePendingMessage]);

  // ===================== 发送消息 =====================

  const sendMessage = useCallback(async (
    content: string,
    options: SendAgentMessageOptions = {},
  ): Promise<void> => {
    console.log('[useAgentChat] sendMessage called, content:', content.slice(0, 50));
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
    parserRef.current.reset();

    initializeStreaming();

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const conversationHistory = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({
          role: m.role,
          content: m.content,
          attachments: m.attachments,
        }));

      const response = await fetch(`${API_BASE}/agent-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any).error || `请求失败 (${response.status})`);
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
        const events = parserRef.current.feed(chunk);

        for (const event of events) {
          handleAgentEvent(event);
        }
      }

      textCoalescerRef.current?.dispose();
      thinkingCoalescerRef.current?.dispose();
      flushAllBuffers();

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[useAgentChat] 请求已取消');
        textCoalescerRef.current?.dispose();
        thinkingCoalescerRef.current?.dispose();
        schedulerRef.current?.dispose();
        flushAllBuffers();

        // 组件卸载导致的 abort（如路由切换），不更新消息状态，避免显示"请求已取消"错误
        if (isUnmountedRef.current) {
          console.log('[useAgentChat] 组件已卸载，跳过错误状态更新');
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
      } else {
        console.error('[useAgentChat] 发送消息失败:', err);
        setError(err.message || '发送失败');

        textCoalescerRef.current?.dispose();
        thinkingCoalescerRef.current?.dispose();
        schedulerRef.current?.dispose();
        flushAllBuffers();

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
    } finally {
      setIsLoading(false);
      setCurrentRunId(null);
      abortControllerRef.current = null;
    }
  }, [currentSession, isLoading, messages, initializeStreaming, handleAgentEvent, flushAllBuffers, addPendingMessage]);

  // ===================== 停止生成 =====================

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    textCoalescerRef.current?.dispose();
    thinkingCoalescerRef.current?.dispose();
    flushAllBuffers();

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

        if (currentSession) {
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

  // 同步 messages 到 session
  useEffect(() => {
    if (messages.length > 0 && currentSession) {
      const lastMsg = messages[messages.length - 1];
      const isStreaming = lastMsg?.isStreaming;

      if (isStreaming) {
        const timer = setTimeout(() => {
          const updatedSession = {
            ...currentSession,
            messages,
            updatedAt: new Date().toISOString(),
          };
          onSessionUpdate(updatedSession);
        }, 100);
        return () => clearTimeout(timer);
      } else {
        const updatedSession = {
          ...currentSession,
          messages,
          updatedAt: new Date().toISOString(),
        };
        onSessionUpdate(updatedSession);
      }
    }
  }, [messages, currentSession, onSessionUpdate]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      // 标记组件已卸载，使 catch 块中的 AbortError 处理跳过错误状态更新
      isUnmountedRef.current = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
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
    compactSession,
    addPendingMessage,
    removePendingMessage,
    updatePendingMessage,
  };
}

export default useAgentChat;
