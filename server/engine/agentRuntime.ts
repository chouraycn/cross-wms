/**
 * Agent 运行时 — 基于 OpenClaw 架构设计
 *
 * 核心职责：
 * 1. 管理 Agent 运行生命周期（start → running → end/error）
 * 2. 协调执行策略（流式输出、工具调用、ReAct 循环等）
 * 3. 通过事件系统向外广播状态变化
 * 4. 支持取消/中断机制
 *
 * 与旧版的区别：
 * - 不再直接操作 SSE Response 对象
 * - 通过 AgentEvent 事件系统与传输层解耦
 * - 支持多订阅者（Gateway、持久化、日志等）
 * - 结构化的 Item/Approval/CommandOutput 事件
 */
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import {
  emitAgentLifecycleEvent,
  emitAgentTextEvent,
  emitAgentThinkingEvent,
  emitAgentToolCallEvent,
  emitAgentToolResultEvent,
  emitAgentItemEvent,
  emitAgentErrorEvent,
  registerAgentRunContext,
  clearAgentRunContext,
  onAgentRunEvent,
  type AgentItemEventData,
  type AgentRunContext,
} from './agentEvents.js';
import { ExecutionStrategyFactory, ExecutionMode } from './executionStrategy.js';
import type { ExecutionStrategyOptions } from './executionStrategy.js';
import type { ToolExecutionResult } from './toolExecutor.js';
import { enhanceInBackground, type EnhancementResult } from './contextEnhancer.js';
import { logger } from '../logger.js';
import type { ModelCallConfig, MessageContent, ToolCall, AIResponse } from '../aiClient.js';

// ===================== 类型定义 =====================

export interface AgentRunParams {
  sessionId: string;
  sessionKey?: string;
  message: string;
  model: string;
  modelName: string;
  modelConfig: ModelCallConfig;
  apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>;
  executionMode: ExecutionMode;
  attachments?: Array<{ type: string; url?: string; content?: string; name?: string }>;
  skillContext?: string;
  skillId?: string;
  agentId?: string;
  userId?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface AgentRunResult {
  runId: string;
  content: string;
  thinkingContent: string;
  hasThinking: boolean;
  thinkingDuration: number;
  toolCalls: ToolExecutionResult['toolCalls'];
  usage?: AIResponse['usage'];
  enhancement: EnhancementResult;
  fallbackModel?: string;
  fallbackReason?: string;
  error?: string;
}

export interface AgentRunHandle {
  runId: string;
  abort: () => void;
  waitForCompletion: () => Promise<AgentRunResult>;
}

// ===================== 活跃 Run 注册表 =====================

const activeRuns = new Map<string, {
  abortController: AbortController;
  promise: Promise<AgentRunResult>;
  resolve: (result: AgentRunResult) => void;
  reject: (error: Error) => void;
}>();

// ===================== 核心运行函数 =====================

/**
 * 启动一个新的 Agent 运行
 *
 * 这是 Agent 运行时的主入口，负责：
 * 1. 创建 run 上下文
 * 2. 启动执行策略
 * 3. 通过事件系统广播状态
 * 4. 管理生命周期
 */
export function startAgentRun(params: AgentRunParams): AgentRunHandle {
  const runId = `run_${randomUUID().slice(0, 8)}`;
  const abortController = new AbortController();

  let resolve!: (result: AgentRunResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<AgentRunResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  activeRuns.set(runId, { abortController, promise, resolve, reject });

  const runContext: AgentRunContext = {
    sessionKey: params.sessionKey ?? params.sessionId,
    sessionId: params.sessionId,
    agentId: params.agentId,
    userId: params.userId,
    model: params.model,
    verboseLevel: 'normal',
    metadata: params.metadata,
  };
  registerAgentRunContext(runId, runContext);

  executeAgentRun(runId, params, abortController.signal)
    .then((result) => {
      resolve(result);
    })
    .catch((error) => {
      logger.error(`[AgentRuntime] Run ${runId} 执行失败:`, error);
      emitAgentErrorEvent({
        runId,
        error: error.message || '执行失败',
        code: error.code || 'EXECUTION_ERROR',
        sessionKey: params.sessionKey,
      });
      reject(error);
    })
    .finally(() => {
      activeRuns.delete(runId);
      setTimeout(() => clearAgentRunContext(runId), 5 * 60 * 1000);
    });

  return {
    runId,
    abort: () => {
      abortController.abort();
    },
    waitForCompletion: () => promise,
  };
}

/**
 * 执行 Agent Run 的核心逻辑
 */
async function executeAgentRun(
  runId: string,
  params: AgentRunParams,
  signal: AbortSignal,
): Promise<AgentRunResult> {
  const startTime = Date.now();
  logger.debug(`[AgentRuntime] 启动 Run ${runId}, mode=${params.executionMode}`);

  emitAgentLifecycleEvent({
    runId,
    phase: 'start',
    data: {
      sessionId: params.sessionId,
      model: params.model,
      modelName: params.modelName,
      executionMode: params.executionMode,
      agentId: params.agentId,
      skillId: params.skillId,
    },
    sessionKey: params.sessionKey,
  });

  try {
    const result = await executeWithStrategy(runId, params, signal);

    emitAgentLifecycleEvent({
      runId,
      phase: 'end',
      data: {
        durationMs: Date.now() - startTime,
        tokenCount: result.usage?.totalTokens ?? 0,
        toolCallCount: result.toolCalls?.length ?? 0,
        fallbackModel: result.fallbackModel,
        fallbackReason: result.fallbackReason,
      },
      sessionKey: params.sessionKey,
    });

    return { ...result, runId };
  } catch (error) {
    const err = error as Error;
    emitAgentLifecycleEvent({
      runId,
      phase: 'error',
      data: {
        error: err.message,
        code: (err as any).code,
        durationMs: Date.now() - startTime,
      },
      sessionKey: params.sessionKey,
    });
    throw error;
  }
}

/**
 * 使用执行策略运行
 */
async function executeWithStrategy(
  runId: string,
  params: AgentRunParams,
  signal: AbortSignal,
): Promise<Omit<AgentRunResult, 'runId'>> {
  const callbacks = createRunCallbacks(runId, params.sessionKey);

  const strategy = ExecutionStrategyFactory.create(params.executionMode);
  const strategyOptions: ExecutionStrategyOptions = {
    sessionId: params.sessionId,
    modelConfig: params.modelConfig,
    messages: params.apiMessages,
    maxToolTurns: 10,
    executionMode: params.executionMode,
    signal,
    onChunk: callbacks.onChunk,
    onThinking: callbacks.onThinking,
    onToolCall: callbacks.onToolCall,
    onSSEEvent: callbacks.onSSEEvent,
    onAgentStart: callbacks.onAgentStart,
    onAgentEnd: callbacks.onAgentEnd,
    onSubtaskCreate: callbacks.onSubtaskCreate,
    onSubtaskComplete: callbacks.onSubtaskComplete,
  };

  const result = await strategy.execute(strategyOptions);

  const thinkingContent = '';
  const hasThinking = false;
  const thinkingDuration = 0;

  const enhancement = await enhanceInBackground({
    messages: params.apiMessages,
    userMessage: params.message,
    sessionId: params.sessionId,
    modelConfig: params.modelConfig,
    ctxWindow: 128000,
    ctxMaxTokens: 8192,
    estimatedToolsCount: 30,
  }).catch(() => ({}));

  return {
    content: result.content,
    thinkingContent,
    hasThinking,
    thinkingDuration,
    toolCalls: result.toolCalls,
    usage: undefined,
    enhancement,
    fallbackModel: undefined,
    fallbackReason: undefined,
  };
}

/**
 * 创建运行时回调，将执行事件转换为 AgentEvent
 */
function createRunCallbacks(runId: string, sessionKey?: string) {
  const itemStates = new Map<string, AgentItemEventData>();

  return {
    onChunk: (text: string) => {
      emitAgentTextEvent({ runId, content: text, delta: true, sessionKey });
    },

    onThinking: (text: string) => {
      emitAgentThinkingEvent({ runId, content: text, delta: true, sessionKey });
    },

    onToolCall: (toolCall: ToolCall, _result: string) => {
      emitAgentToolCallEvent({
        runId,
        toolCallId: toolCall.id || `tc_${randomUUID().slice(0, 8)}`,
        toolName: toolCall.function?.name || 'unknown',
        toolArgs: toolCall.function?.arguments
          ? (() => {
              try { return JSON.parse(toolCall.function.arguments); } catch { return {}; }
            })()
          : {},
        sessionKey,
      });
    },

    onAgentStart: (agentId: string, agentRole: string, taskDescription: string, subTaskId?: string) => {
      const itemId = subTaskId || `item_${randomUUID().slice(0, 8)}`;
      const itemData: AgentItemEventData = {
        itemId,
        phase: 'start',
        kind: 'analysis',
        title: `${agentRole} 正在处理任务`,
        status: 'running',
        name: agentId,
        meta: taskDescription,
        startedAt: Date.now(),
      };
      itemStates.set(itemId, itemData);
      emitAgentItemEvent({ runId, data: itemData, sessionKey });
    },

    onAgentEnd: (agentId: string, _agentRole: string, status: 'success' | 'failed' | 'timeout', duration?: number, error?: string) => {
      for (const [itemId, item] of itemStates) {
        if (item.name === agentId && item.status === 'running') {
          const updated: AgentItemEventData = {
            ...item,
            phase: 'end',
            status: status === 'success' ? 'completed' : status === 'failed' ? 'failed' : 'blocked',
            endedAt: Date.now(),
            durationMs: duration,
            error,
          };
          emitAgentItemEvent({ runId, data: updated, sessionKey });
          itemStates.delete(itemId);
          break;
        }
      }
    },

    onSubtaskCreate: (subTaskId: string, description: string, _dependsOn?: string[], _priority?: number) => {
      const itemData: AgentItemEventData = {
        itemId: subTaskId,
        phase: 'start',
        kind: 'plan',
        title: description,
        status: 'running',
        startedAt: Date.now(),
      };
      itemStates.set(subTaskId, itemData);
      emitAgentItemEvent({ runId, data: itemData, sessionKey });
    },

    onSubtaskComplete: (subTaskId: string, _description: string, status: 'completed' | 'failed', _agentId: string, duration?: number, resultSummary?: string) => {
      const existing = itemStates.get(subTaskId);
      if (existing) {
        const updated: AgentItemEventData = {
          ...existing,
          phase: 'end',
          status: status === 'completed' ? 'completed' : 'failed',
          endedAt: Date.now(),
          durationMs: duration,
          summary: resultSummary,
        };
        emitAgentItemEvent({ runId, data: updated, sessionKey });
        itemStates.delete(subTaskId);
      }
    },

    onSSEEvent: (event: Record<string, unknown>) => {
      logger.debug(`[AgentRuntime] SSE事件: ${event.type}`);
    },
  };
}

// ===================== Run 管理 =====================

/**
 * 取消指定的 Agent Run
 */
export function abortAgentRun(runId: string): boolean {
  const run = activeRuns.get(runId);
  if (run) {
    run.abortController.abort();
    return true;
  }
  return false;
}

/**
 * 取消会话下所有活跃的 Run
 */
export function abortAgentRunsForSession(sessionKey: string): number {
  let count = 0;
  for (const [runId, run] of activeRuns.entries()) {
    const ctx = registerAgentRunContext.length > 0;
    if (ctx) {
      run.abortController.abort();
      count++;
    }
  }
  return count;
}

/**
 * 获取指定 Run 的状态
 */
export function getAgentRunStatus(runId: string): 'running' | 'completed' | 'not_found' {
  return activeRuns.has(runId) ? 'running' : 'not_found';
}

/**
 * 获取当前活跃 Run 数量
 */
export function getActiveRunCount(): number {
  return activeRuns.size;
}

// ===================== SSE 桥接函数 =====================

/**
 * 将 Agent 事件桥接到 SSE 响应
 *
 * 这是一个适配层，让现有的 SSE 客户端也能接收 Agent 事件。
 * 前端新代码应该直接使用事件系统。
 */
export function bridgeAgentEventsToSSE(runId: string, res: Response): () => void {
  const unsubscribe = onAgentRunEvent(runId, (evt) => {
    if (res.writableEnded) return;

    const sseEvent = convertAgentEventToSSE(evt);
    if (sseEvent) {
      try {
        res.write(`data: ${JSON.stringify(sseEvent)}\n\n`);
      } catch {
        // 连接已断开
      }
    }
  });

  return unsubscribe;
}

/**
 * 将 AgentEvent 转换为 SSE 事件格式（向后兼容）
 */
function convertAgentEventToSSE(evt: { stream: string; data: Record<string, unknown> }): Record<string, unknown> | null {
  switch (evt.stream) {
    case 'lifecycle': {
      const phase = evt.data.phase;
      if (phase === 'start') {
        return {
          type: 'init',
          sessionId: evt.data.sessionId,
          model: evt.data.model,
          modelName: evt.data.modelName,
        };
      }
      if (phase === 'end') {
        return {
          type: 'done',
          errorCode: null,
          errorMessage: null,
        };
      }
      if (phase === 'error') {
        return {
          type: 'error',
          code: (evt.data as any).code || 'UNKNOWN_ERROR',
          message: (evt.data as any).error || '执行失败',
        };
      }
      return null;
    }

    case 'assistant':
      if ((evt.data as any).type === 'text') {
        return {
          type: 'text',
          content: (evt.data as any).content,
        };
      }
      return null;

    case 'thinking':
      return {
        type: 'thinking',
        content: (evt.data as any).content,
      };

    case 'tool':
      return {
        type: 'tool_call',
        toolCallId: (evt.data as any).toolCallId,
        toolName: (evt.data as any).toolName,
        toolArgs: JSON.stringify((evt.data as any).toolArgs || {}),
        result: (evt.data as any).result,
      };

    case 'item':
      return {
        type: 'debug',
        _channel: 'debug',
        stream: 'item',
        ...evt.data,
      };

    case 'error':
      return {
        type: 'error',
        code: (evt.data as any).code || 'UNKNOWN_ERROR',
        message: (evt.data as any).message || '发生错误',
      };

    default:
      return {
        type: 'debug',
        _channel: 'debug',
        stream: evt.stream,
        ...evt.data,
      };
  }
}

// ===================== 初始化 =====================

/**
 * 定期清理过期的 run 上下文
 */
let sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startAgentRuntime(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    import('./agentEvents.js').then(({ sweepStaleRunContexts }) => {
      sweepStaleRunContexts();
    });
  }, 5 * 60 * 1000);
  logger.info('[AgentRuntime] Agent 运行时已启动');
}

export function stopAgentRuntime(): void {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  for (const run of activeRuns.values()) {
    run.abortController.abort();
  }
  activeRuns.clear();
  logger.info('[AgentRuntime] Agent 运行时已停止');
}
