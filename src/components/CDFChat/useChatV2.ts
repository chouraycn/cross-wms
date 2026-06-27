/**
 * CDFChat 新版对话 Hook（useChatV2）
 *
 * 核心设计原则：
 * 1. 使用 fetch + ReadableStream 接收 SSE（不依赖 EventSource）
 * 2. 不使用 in-place mutation，每次更新创建新的 MessageEnvelope 引用
 * 3. 超时保护：30s 无任何事件 → 自动标记 isStreaming=false + 显示超时提示
 * 4. 错误保护：任何异常都确保 isStreaming = false
 * 5. 简单状态机：idle → streaming → done/error
 * 6. 不使用 thinkingDone 字段，改用 isStreaming && !content 判断加载态
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { MessageEnvelope, ToolBlock } from '../../types/message-envelope.js';

// ===================== 类型 =====================

type ChatState = 'idle' | 'streaming' | 'done' | 'error';

interface UseChatV2Options {
  /** API 端点（默认 /api/chat/stream） */
  apiEndpoint?: string;
  /** 默认模型名称 */
  defaultModel?: string;
}

interface UseChatV2Return {
  messages: MessageEnvelope[];
  state: ChatState;
  sendMessage: (content: string) => void;
  stopGeneration: () => void;
  error?: string;
}

// ===================== 常量 =====================

/** 超时时间：30s 无任何事件则自动结束 */
const TIMEOUT_MS = 30_000;

/** 最大重试次数 */
const MAX_RETRIES = 2;

/** 生成消息 ID */
function genId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `msg_${ts}_${rand}`;
}

// ===================== Hook =====================

export function useChatV2(options: UseChatV2Options = {}): UseChatV2Return {
  const { apiEndpoint = '/api/chat/stream', defaultModel = '' } = options;

  const [messages, setMessages] = useState<MessageEnvelope[]>([]);
  const [state, setState] = useState<ChatState>('idle');
  const [error, setError] = useState<string | undefined>();

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const startTimeRef = useRef(0);
  const sessionIdRef = useRef(`cdf_${Date.now()}`);

  // 清理超时定时器
  const clearTimeout_ = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // 启动超时定时器
  const startTimeout = useCallback((onTimeout: () => void) => {
    clearTimeout_();
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      onTimeout();
    }, TIMEOUT_MS);
  }, [clearTimeout_]);

  // 停止生成
  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    clearTimeout_();
    setState('done');
  }, [clearTimeout_]);

  // SSE 流式处理核心
  const processStream = useCallback(
    async (userContent: string, retryAttempt = 0) => {
      // 防止重复发送
      if (state === 'streaming') return;

      const abortController = new AbortController();
      abortRef.current = abortController;
      startTimeRef.current = Date.now();

      // 创建用户消息
      const userMsg: MessageEnvelope = {
        id: genId(),
        role: 'user',
        content: userContent,
        isStreaming: false,
        timestamp: Date.now(),
      };

      // 创建 AI 响应占位消息
      const assistantId = genId();
      const assistantMsg: MessageEnvelope = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        timestamp: Date.now(),
        meta: {
          model: defaultModel,
          tokenIn: 0,
          tokenOut: 0,
          elapsedMs: 0,
          sessionId: sessionIdRef.current,
          toolTrace: [],
        },
      };

      // 一次性设置消息和状态
      setMessages(prev => [...prev, userMsg, assistantMsg]);
      setState('streaming');
      setError(undefined);

      // 启动超时保护
      startTimeout(() => {
        // 超时：确保 isStreaming = false
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId ? { ...m, isStreaming: false, content: m.content || '(响应超时，请重试)' } : m,
          ),
        );
        setState('error');
        setError('响应超时（30s 无数据），请检查网络或重试');
        abortController.abort();
      });

      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userContent,
            sessionId: sessionIdRef.current,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Response body is null — streaming not supported');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            // 收到任何有效数据 → 重置超时
            startTimeout(() => {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, isStreaming: false, content: m.content || '(响应超时，请重试)' }
                    : m,
                ),
              );
              setState('error');
              setError('响应超时（30s 无数据），请检查网络或重试');
              abortController.abort();
            });

            try {
              const event = {
                type: 'unknown',
                ...(JSON.parse(data) as Record<string, unknown>),
              } as {
                type: string;
                content?: string;
                toolBlock?: ToolBlock;
                toolBlockId?: string;
                toolBlockUpdates?: Partial<ToolBlock>;
                model?: string;
                elapsedMs?: number;
                tokenIn?: number;
                tokenOut?: number;
                autoReason?: string;
                error?: string;
                message?: string;
                from?: string;
                to?: string;
                reason?: string;
              };

              switch (event.type) {
                case 'message-stream':
                  if (event.content != null) {
                    accumulatedContent += event.content;
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantId
                          ? { ...m, content: accumulatedContent, isStreaming: true }
                          : m,
                      ),
                    );
                  }
                  break;

                case 'message-tool':
                  if (event.toolBlock) {
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantId
                          ? { ...m, toolBlocks: [...(m.toolBlocks || []), event.toolBlock!] }
                          : m,
                      ),
                    );
                  }
                  if (event.toolBlockId && event.toolBlockUpdates) {
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantId
                          ? {
                              ...m,
                              toolBlocks: (m.toolBlocks || []).map(tb =>
                                tb.id === event.toolBlockId ? { ...tb, ...event.toolBlockUpdates! } : tb,
                              ),
                            }
                          : m,
                      ),
                    );
                  }
                  break;

                case 'message-done': {
                  const elapsed = event.elapsedMs ?? Date.now() - startTimeRef.current;
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId
                        ? {
                            ...m,
                            isStreaming: false,
                            meta: m.meta
                              ? {
                                  ...m.meta,
                                  model: event.model || m.meta.model,
                                  elapsedMs: elapsed,
                                  tokenIn: event.tokenIn ?? m.meta.tokenIn,
                                  tokenOut: event.tokenOut ?? m.meta.tokenOut,
                                  autoReason: event.autoReason ?? m.meta.autoReason,
                                }
                              : undefined,
                          }
                        : m,
                    ),
                  );
                  setState('done');
                  retryCountRef.current = 0;
                  clearTimeout_();
                  return; // 正常结束
                }

                case 'message-error':
                  throw new Error(event.error || 'Unknown error from server');

                case 'strategy_fallback':
                  // 执行策略降级（如 ReAct → Legacy），通知用户
                  if (event.message) {
                    const fallbackBlock = {
                      id: `strategy_${Date.now()}`,
                      type: 'skill' as const,
                      name: '__strategy_fallback__',
                      input: { from: event.from, to: event.to, reason: event.reason },
                      result: event.message,
                      status: 'done' as const,
                    };
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantId
                          ? {
                              ...m,
                              toolBlocks: [...(m.toolBlocks || []), fallbackBlock],
                            }
                          : m,
                      ),
                    );
                  }
                  break;

                default:
                  // keep-alive 或其他事件 — 忽略
                  break;
              }
            } catch (parseErr) {
              // JSON 解析失败 — 只抛出业务错误
              const msg = (parseErr as Error).message;
              if (msg.startsWith('HTTP') || msg.includes('server') || msg.includes('Unknown error')) {
                throw parseErr;
              }
              // 非业务错误（纯 JSON 解析失败）— 忽略
            }
          }
        }

        // 流结束但没有收到 done 事件 — 手动完成
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? {
                  ...m,
                  isStreaming: false,
                  meta: m.meta
                    ? { ...m.meta, elapsedMs: Date.now() - startTimeRef.current }
                    : undefined,
                }
              : m,
          ),
        );
        setState('done');
      } catch (err: unknown) {
        // 被用户主动中止
        if (err instanceof DOMException && err.name === 'AbortError') {
          setMessages(prev =>
            prev.map(m =>
              m.id === assistantId
                ? {
                    ...m,
                    isStreaming: false,
                    meta: m.meta
                      ? { ...m.meta, elapsedMs: Date.now() - startTimeRef.current }
                      : undefined,
                  }
                : m,
            ),
          );
          setState('done');
          return;
        }

        const errorMessage = err instanceof Error ? err.message : String(err);

        // 重试逻辑（仅对非 4xx 错误重试）
        if (retryAttempt < MAX_RETRIES && !errorMessage.includes('HTTP 4')) {
          retryCountRef.current += 1;
          await new Promise(resolve => setTimeout(resolve, 1000 * retryAttempt));
          // 移除之前的占位消息后重试
          setMessages(prev => prev.slice(0, -2));
          processStream(userContent, retryAttempt + 1);
          return;
        }

        // 最终错误 — 确保 isStreaming = false
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, isStreaming: false, content: m.content || `Error: ${errorMessage}` }
              : m,
          ),
        );
        setState('error');
        setError(errorMessage);
      } finally {
        clearTimeout_();
        abortRef.current = null;
      }
    },
    [apiEndpoint, defaultModel, state, startTimeout, clearTimeout_],
  );

  // 发送消息
  const sendMessage = useCallback(
    (content: string) => {
      if (state === 'streaming') return;
      retryCountRef.current = 0;
      processStream(content.trim());
    },
    [state, processStream],
  );

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      clearTimeout_();
    };
  }, [clearTimeout_]);

  return {
    messages,
    state,
    sendMessage,
    stopGeneration,
    error,
  };
}
