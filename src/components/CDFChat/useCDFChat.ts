/**
 * CDFChat 核心 Hook
 *
 * - useReducer 状态管理（替代 in-place mutation + ref）
 * - sendMessage(content) — 发送消息并启动 SSE 流式接收
 * - stopGeneration() — 停止生成
 * - 超时检测：30s 无 text 事件自动设置 thinkingDone=true
 * - 重试机制：最多 2 次
 * - 错误边界：捕获所有异常，显示错误消息而非卡住
 */
import { useReducer, useCallback, useRef, useEffect } from 'react';
import type {
  CDFMessage,
  CDFChatState,
  CDFChatAction,
  CDFToolBlock,
} from './types';

// ===================== 常量 =====================

/** 超时时间：30s 内没有 text 事件则自动设置 thinkingDone */
const THINKING_TIMEOUT_MS = 30_000;

/** 最大重试次数 */
const MAX_RETRIES = 2;

/** 生成消息 ID */
function genId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cdf_${ts}_${rand}`;
}

// ===================== Reducer =====================

/** 初始状态 */
const initialState: CDFChatState = {
  messages: [],
  isStreaming: false,
  error: null,
  model: '',
  elapsedMs: 0,
};

/** Reducer：纯函数，不可变更新 */
function chatReducer(state: CDFChatState, action: CDFChatAction): CDFChatState {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
        isStreaming: action.payload.role === 'assistant' ? true : state.isStreaming,
        error: null,
      };

    case 'UPDATE_STREAMING': {
      const { messageId, content } = action.payload;
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === messageId ? { ...msg, content, isStreaming: true } : msg,
        ),
      };
    }

    case 'SET_THINKING': {
      const { messageId, thinking, thinkingDone } = action.payload;
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? { ...msg, thinking, thinkingDone: thinkingDone ?? msg.thinkingDone }
            : msg,
        ),
      };
    }

    case 'ADD_TOOL_BLOCK': {
      const { messageId, toolBlock } = action.payload;
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? { ...msg, toolBlocks: [...(msg.toolBlocks || []), toolBlock] }
            : msg,
        ),
      };
    }

    case 'UPDATE_TOOL_BLOCK': {
      const { messageId, toolBlockId, updates } = action.payload;
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                toolBlocks: (msg.toolBlocks || []).map((tb) =>
                  tb.id === toolBlockId ? { ...tb, ...updates } : tb,
                ),
              }
            : msg,
        ),
      };
    }

    case 'DONE': {
      const { messageId, meta } = action.payload;
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                isStreaming: false,
                thinkingDone: true,
                model: meta?.model ?? msg.model,
                elapsedMs: meta?.elapsedMs ?? msg.elapsedMs,
                tokenIn: meta?.tokenIn ?? msg.tokenIn,
                tokenOut: meta?.tokenOut ?? msg.tokenOut,
                autoReason: meta?.autoReason ?? msg.autoReason,
              }
            : msg,
        ),
        isStreaming: false,
        error: null,
      };
    }

    case 'ERROR': {
      const { messageId, error } = action.payload;
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.id === messageId
            ? { ...msg, isStreaming: false, thinkingDone: true }
            : msg,
        ),
        isStreaming: false,
        error,
      };
    }

    case 'RESET':
      return initialState;

    case 'SET_ELAPSED':
      return { ...state, elapsedMs: action.payload };

    default:
      return state;
  }
}

// ===================== Hook =====================

/** useCDFChat 配置 */
export interface UseCDFChatOptions {
  /** API 端点 */
  apiEndpoint: string;
  /** 默认模型 */
  defaultModel?: string;
}

/** useCDFChat 返回值 */
export interface UseCDFChatReturn {
  state: CDFChatState;
  sendMessage: (content: string) => void;
  stopGeneration: () => void;
  clearError: () => void;
}

/**
 * CDFChat 核心 Hook
 *
 * 使用 useReducer 管理状态，SSE 流式处理，
 * 超时兜底 + 错误边界 + 重试机制。
 */
export function useCDFChat(options: UseCDFChatOptions): UseCDFChatReturn {
  const { apiEndpoint, defaultModel = '' } = options;
  const [state, dispatch] = useReducer(chatReducer, {
    ...initialState,
    model: defaultModel,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const startTimeRef = useRef(0);

  // 清理定时器
  const clearTimers = useCallback(() => {
    if (thinkingTimerRef.current) {
      clearTimeout(thinkingTimerRef.current);
      thinkingTimerRef.current = null;
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  // 停止生成
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    clearTimers();
  }, [clearTimers]);

  // 清除错误
  const clearError = useCallback(() => {
    dispatch({ type: 'ERROR', payload: { messageId: '', error: '' } });
    // 用一个 hack 方式清除 error：直接 reset 不会丢失消息
    // 这里我们 dispatch 一个无意义的 ERROR 来覆盖
  }, []);

  // 启动思考超时定时器
  const startThinkingTimeout = useCallback(
    (messageId: string) => {
      if (thinkingTimerRef.current) {
        clearTimeout(thinkingTimerRef.current);
      }
      thinkingTimerRef.current = setTimeout(() => {
        // 30s 超时：自动设置 thinkingDone=true
        dispatch({
          type: 'SET_THINKING',
          payload: { messageId, thinking: '', thinkingDone: true },
        });
        thinkingTimerRef.current = null;
      }, THINKING_TIMEOUT_MS);
    },
    [],
  );

  // 启动耗时计时器
  const startElapsedTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
    }
    elapsedTimerRef.current = setInterval(() => {
      dispatch({ type: 'SET_ELAPSED', payload: Date.now() - startTimeRef.current });
    }, 100);
  }, []);

  // SSE 流式处理
  const processSSEStream = useCallback(
    async (userContent: string, retryAttempt = 0) => {
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      // 创建用户消息
      const userMessage: CDFMessage = {
        id: genId(),
        role: 'user',
        content: userContent,
        timestamp: Date.now(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: userMessage });

      // 创建 AI 响应占位消息
      const assistantId = genId();
      const assistantMessage: CDFMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        thinking: '',
        thinkingDone: false,
        model: defaultModel,
        timestamp: Date.now(),
      };
      dispatch({ type: 'ADD_MESSAGE', payload: assistantMessage });

      // 启动超时和计时
      startThinkingTimeout(assistantId);
      startElapsedTimer();

      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userContent,
            sessionId: `cdf_${Date.now()}`,
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
        let accumulatedThinking = '';

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

            try {
              const event = JSON.parse(data) as {
                type: string;
                content?: string;
                thinking?: string;
                thinkingDone?: boolean;
                toolBlock?: CDFToolBlock;
                toolBlockId?: string;
                toolBlockUpdates?: Partial<CDFToolBlock>;
                model?: string;
                elapsedMs?: number;
                tokenIn?: number;
                tokenOut?: number;
                autoReason?: string;
                error?: string;
              };

              switch (event.type) {
                case 'message-thinking':
                  // 收到 thinking 事件 — 重置超时定时器
                  if (thinkingTimerRef.current) {
                    clearTimeout(thinkingTimerRef.current);
                    thinkingTimerRef.current = null;
                  }
                  if (event.thinking != null) {
                    accumulatedThinking += event.thinking;
                    dispatch({
                      type: 'SET_THINKING',
                      payload: {
                        messageId: assistantId,
                        thinking: accumulatedThinking,
                        thinkingDone: event.thinkingDone ?? false,
                      },
                    });
                  }
                  if (event.thinkingDone) {
                    // thinking 完成 — 不再需要超时
                  } else {
                    // 重新启动超时
                    startThinkingTimeout(assistantId);
                  }
                  break;

                case 'message-stream':
                  // 收到 text 事件 — 清除思考超时
                  if (thinkingTimerRef.current) {
                    clearTimeout(thinkingTimerRef.current);
                    thinkingTimerRef.current = null;
                  }
                  if (!state.messages.find((m) => m.id === assistantId)?.thinkingDone) {
                    dispatch({
                      type: 'SET_THINKING',
                      payload: { messageId: assistantId, thinking: accumulatedThinking, thinkingDone: true },
                    });
                  }
                  if (event.content != null) {
                    accumulatedContent += event.content;
                    dispatch({
                      type: 'UPDATE_STREAMING',
                      payload: { messageId: assistantId, content: accumulatedContent },
                    });
                  }
                  break;

                case 'message-tool':
                  if (event.toolBlock) {
                    dispatch({
                      type: 'ADD_TOOL_BLOCK',
                      payload: { messageId: assistantId, toolBlock: event.toolBlock },
                    });
                  }
                  if (event.toolBlockId && event.toolBlockUpdates) {
                    dispatch({
                      type: 'UPDATE_TOOL_BLOCK',
                      payload: {
                        messageId: assistantId,
                        toolBlockId: event.toolBlockId,
                        updates: event.toolBlockUpdates,
                      },
                    });
                  }
                  break;

                case 'message-done':
                  dispatch({
                    type: 'DONE',
                    payload: {
                      messageId: assistantId,
                      meta: {
                        model: event.model,
                        elapsedMs: event.elapsedMs ?? Date.now() - startTimeRef.current,
                        tokenIn: event.tokenIn,
                        tokenOut: event.tokenOut,
                        autoReason: event.autoReason,
                      },
                    },
                  });
                  retryCountRef.current = 0;
                  break;

                case 'message-error':
                  throw new Error(event.error || 'Unknown error from server');

                default:
                  // keep-alive 或其他事件 — 忽略
                  break;
              }
            } catch (parseErr) {
              // JSON 解析失败 — 忽略非 JSON 行
              if ((parseErr as Error).message.startsWith('HTTP') || (parseErr as Error).message.includes('server')) {
                throw parseErr;
              }
            }
          }
        }

        // 流结束但没有收到 done 事件 — 手动完成
        const currentMsg = state.messages.find((m) => m.id === assistantId);
        if (currentMsg?.isStreaming) {
          dispatch({
            type: 'DONE',
            payload: {
              messageId: assistantId,
              meta: {
                elapsedMs: Date.now() - startTimeRef.current,
              },
            },
          });
        }
      } catch (err: unknown) {
        // 被用户主动中止
        if (err instanceof DOMException && err.name === 'AbortError') {
          dispatch({
            type: 'DONE',
            payload: {
              messageId: assistantId,
              meta: { elapsedMs: Date.now() - startTimeRef.current },
            },
          });
          return;
        }

        const errorMessage = err instanceof Error ? err.message : String(err);

        // 重试逻辑
        if (retryAttempt < MAX_RETRIES && !errorMessage.includes('HTTP 4')) {
          retryCountRef.current += 1;
          // 短暂延迟后重试
          await new Promise((resolve) => setTimeout(resolve, 1000 * retryAttempt));
          // 递归重试（重新创建消息）
          dispatch({ type: 'RESET' });
          processSSEStream(userContent, retryAttempt + 1);
          return;
        }

        dispatch({
          type: 'ERROR',
          payload: { messageId: assistantId, error: errorMessage },
        });
      } finally {
        clearTimers();
        abortControllerRef.current = null;
      }
    },
    [apiEndpoint, defaultModel, state.messages, startThinkingTimeout, startElapsedTimer, clearTimers],
  );

  // 发送消息
  const sendMessage = useCallback(
    (content: string) => {
      if (state.isStreaming) return;
      retryCountRef.current = 0;
      processSSEStream(content.trim());
    },
    [state.isStreaming, processSSEStream],
  );

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      stopGeneration();
    };
  }, [stopGeneration]);

  return {
    state,
    sendMessage,
    stopGeneration,
    clearError,
  };
}
