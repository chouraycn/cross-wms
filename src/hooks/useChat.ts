import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, ReferencedSession, Session } from '../types/chat';
import type { InventoryQueryPayload, QueryResult, DataSourceType } from '../types/inventory-query';

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
  /** 参数预设 ID（creative/code/translate/analysis/precise） */
  preset?: string;
}

/** inventory_query JSON 块正则 */
const QUERY_BLOCK_REGEX = /```inventory_query\s*\n([\s\S]*?)\n```/;

export function useChat(currentSession: Session | undefined, onSessionUpdate: (session: Session) => void) {
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  /** v1.7.0: 每个会话级别限制一次 SQL 失败自动重试 */
  const autoRetriedRef = useRef<boolean>(false);
  /** v1.8.0: AbortController 用于中断请求 */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** v1.8.0: 当前正在流式输出的消息 ID */
  const streamingMsgIdRef = useRef<string | null>(null);

  /**
   * v1.8.0: 中断当前 AI 生成
   */
  const stopGeneration = useCallback(() => {
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
    onSessionUpdate(updatedSession);

    try {
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          message: correctionMessage,
          model: session.model,
          skillId: 'builtin-inventory-query',
        }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'text') fullContent += data.content;
                if (data.type === 'done') {
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

                    const sessionWithLoading = { ...session, messages: [...session.messages, retryAssistantMsg] };
                    onSessionUpdate(sessionWithLoading);

                    try {
                      const payload: InventoryQueryPayload = JSON.parse(jsonStr);
                      const apiRes = await fetch('http://localhost:3001/api/inventory/nl-query', {
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
                    const finalSession = { ...session, messages: [...session.messages, retryAssistantMsg] };
                    onSessionUpdate(finalSession);
                  }
                }
              } catch { /* stream parse error */ }
            }
          }
        }
      }
    } catch (e) {
      console.error('[useChat] Auto-retry failed:', e);
    }
  }, []);

  const sendMessage = useCallback(async (content: string, options?: SendMessageOptions) => {
    if (!content.trim() || isLoading) return;
    setIsLoading(true);

    // v1.8.0: 创建新的 AbortController
    abortControllerRef.current = new AbortController();

    const session = currentSession || {
      id: uuidv4(),
      title: content.slice(0, 30),
      model: getDefaultModelId(),
      messages: []
    };

    const userMsg: Message = {
      id: uuidv4(),
      role: 'user',
      content,
      timestamp: new Date(),
      referencedSessions: options?.referencedSessions,
    };
    const updatedSession = { ...session, messages: [...session.messages, userMsg] };
    onSessionUpdate(updatedSession);

    // v1.8.0: 创建流式 assistant 消息占位（实时更新）
    const streamingMsgId = uuidv4();
    streamingMsgIdRef.current = streamingMsgId;
    const streamingMsg: Message = {
      id: streamingMsgId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    const sessionWithStreaming = { ...session, messages: [...session.messages, userMsg, streamingMsg] };
    onSessionUpdate(sessionWithStreaming);

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
      // 如果有参数预设，传递给后端
      if (options?.preset) {
        body.preset = options.preset;
      }
      // 如果有历史消息，添加到请求体（用于多轮对话）
      if (session.messages.length > 0) {
        body.conversationHistory = session.messages.map(m => ({
          role: m.role,
          content: m.content,
        }));
      }

      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortControllerRef.current.signal,
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let currentAutoReason: string | undefined;
      let currentAutoReasonType: string | undefined;
      let currentPreset: { id: string; label: string } | null = null;
      let currentErrorCode: string | null = null;
      let currentErrorMessage: string | null = null;

      if (reader) {
        while (true) { // eslint-disable-line no-constant-condition
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === 'text') {
                  fullContent += data.content;
                  // v1.8.0: 实时更新流式消息内容
                  streamingMsg.content = fullContent;
                  onSessionUpdate({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), { ...streamingMsg, content: fullContent }] });
                }
                if (data.type === 'init') {
                  // 捕获 Auto 选型原因和预设信息
                  if (data.autoReason) currentAutoReason = data.autoReason;
                  if (data.autoReasonType) currentAutoReasonType = data.autoReasonType;
                  if (data.preset) currentPreset = data.preset;
                }
                if (data.type === 'done') {
                  currentErrorCode = data.errorCode ?? null;
                  currentErrorMessage = data.errorMessage ?? null;
                  // 如果流结束时有错误，用错误消息替换已累积的内容，避免包含异常流数据
                  if (currentErrorCode && currentErrorMessage) {
                    fullContent = currentErrorMessage;
                  }
                }
              } catch { /* stream parse error, skip */ }
            }
          }
        }
      }

      // v1.8.0: 流结束，将占位消息替换为最终消息
      streamingMsgIdRef.current = null;
      streamingMsg.isStreaming = false;
      streamingMsg.content = fullContent;
      streamingMsg.autoReason = currentAutoReason;
      streamingMsg.autoReasonType = currentAutoReasonType as any;
      streamingMsg.activePreset = currentPreset;

      if (currentErrorCode) {
        streamingMsg.metadata = {
          error: currentErrorMessage || '请求失败',
          errorCode: currentErrorCode,
        };
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
        onSessionUpdate({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), { ...streamingMsg, metadata: { loading: true } }] });

        // 异步调用后端 API 执行查询
        (async () => {
          try {
            const payload: InventoryQueryPayload = JSON.parse(jsonStr);
            const apiRes = await fetch('http://localhost:3001/api/inventory/nl-query', {
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

              // 更新会话后触发自动重试
              const failedSession = {
                ...session,
                messages: [...session.messages, streamingMsg],
              };
              onSessionUpdate(failedSession);

              // 异步自动重试（不阻塞当前 UI 更新）
              retryOnSqlFailure(session, content, apiData, onSessionUpdate);
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

          // 更新会话
          const finalSession = {
            ...session,
            messages: [
              ...session.messages,
              streamingMsg,
            ],
          };
          onSessionUpdate(finalSession);
        })();
      } else {
        // 无 inventory_query JSON 块，直接更新最终消息
        onSessionUpdate({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), streamingMsg] });
      }

      // v1.7.0: 重置 autoRetried 标记（新对话开始时）
      if (session.messages.length === 0) {
        autoRetriedRef.current = false;
      }
    } catch (e) {
      console.error(e);
      streamingMsgIdRef.current = null;

      // v1.8.0: 区分取消错误和其他错误
      let errorContent: string;
      if (e instanceof Error && e.name === 'AbortError') {
        errorContent = streamingMsg.content || '已取消生成。';
        // 保留已生成的内容，标记为非流式
        streamingMsg.isStreaming = false;
        streamingMsg.content = errorContent;
        onSessionUpdate({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), streamingMsg] });
      } else {
        const errorMsg = e instanceof Error ? e.message : String(e);
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
        onSessionUpdate({ ...sessionWithStreaming, messages: [...sessionWithStreaming.messages.slice(0, -1), streamingMsg] });
      }
    }
    setIsLoading(false);
    abortControllerRef.current = null;
    setInputValue('');
  }, [currentSession, isLoading, onSessionUpdate, retryOnSqlFailure]);

  /** v1.7.0: 重置 autoRetriedRef（切换会话或新对话时调用） */
  const resetAutoRetry = useCallback(() => {
    autoRetriedRef.current = false;
  }, []);

  return { isLoading, inputValue, setInputValue, sendMessage, stopGeneration, resetAutoRetry };
}
