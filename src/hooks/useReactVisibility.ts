/**
 * useReactVisibility Hook — 从 Message 中提取 ReAct 可见性状态（T04）
 *
 * 监听 ReAct 阶段变化事件，将工具调用信息收集到执行计划中，
 * 暴露 phase/plan 给 ReactPhaseIndicator / ExecutionPlanPanel / ToolCallCard 消费。
 *
 * 设计原则：
 * - 不修改 useAgentChat 的核心逻辑，仅从 messages 中提取状态
 * - 组件可独立使用，不强制绑定特定页面
 * - 与 server 端 SSE 事件格式对齐
 */

import { useMemo } from 'react';
import type { Message } from '../types/chat';
import type {
  ReActPhase,
  ReactVisibilityState,
  ToolCallState,
  ExecutionPlanState,
  PlanStepState,
  TurnTraceEvent,
} from '../types/react-events';

// ===================== 辅助函数 =====================

/** 从 Message.toolExecutionStatus 提取 ToolCallState 列表 */
function extractToolCallStates(msg: Message): ToolCallState[] {
  const toolCalls: ToolCallState[] = [];

  // 从 toolCalls 数组提取
  if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
    const executionStatus = msg.toolExecutionStatus || {};

    for (const tc of msg.toolCalls) {
      // 跳过折叠摘要占位
      if ((tc as any)._folded) continue;

      const tcId = tc.id || '';
      const statusEntry = executionStatus[tcId];

      // 从 toolExecutionStatus 获取更详细的状态
      let status: ToolCallState['status'] = 'completed';
      let durationMs: number | undefined;
      let retryCount: number | undefined;
      let startedAt: number | undefined;
      let endedAt: number | undefined;

      if (statusEntry) {
        status = statusEntry.status;
        durationMs = statusEntry.durationMs;
        retryCount = statusEntry.retryCount;
        startedAt = statusEntry.startTime;
        endedAt = statusEntry.endTime;
      } else {
        // 回退：从 result 判断是否失败
        if (tc.result) {
          const lower = tc.result.toLowerCase();
          if (lower.startsWith('error:') || lower.startsWith('错误:')) {
            status = 'failed';
          }
        } else {
          status = 'running';
        }
      }

      toolCalls.push({
        id: tcId,
        name: tc.name,
        arguments: tc.arguments,
        status,
        result: tc.result || undefined,
        durationMs,
        retryCount,
        startedAt,
        endedAt,
      });
    }
  }

  return toolCalls;
}

/** 从 Message.executionPlan 提取 ExecutionPlanState */
function extractExecutionPlan(msg: Message): ExecutionPlanState | undefined {
  if (!msg.executionPlan) return undefined;

  const plan = msg.executionPlan;
  return {
    id: plan.id,
    intent: plan.intent,
    steps: plan.steps.map((s): PlanStepState => ({
      step: s.step,
      description: s.description,
      toolName: s.toolName,
      status: s.status,
      dependsOn: s.dependsOn,
    })),
    isDynamic: plan.isDynamic,
    createdAt: plan.createdAt,
  };
}

/** 从 Message.reactPhase 提取当前阶段 */
function extractCurrentPhase(msg: Message): {
  phase: ReActPhase;
  step?: number;
  totalSteps?: number;
  description?: string;
} {
  if (msg.reactPhase) {
    return {
      phase: msg.reactPhase.phase,
      step: msg.reactPhase.step,
      totalSteps: msg.reactPhase.totalSteps,
      description: msg.reactPhase.description,
    };
  }

  // 从 toolCalls 和 isStreaming 推断阶段
  if (msg.isStreaming) {
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      const hasRunning = msg.toolCalls.some(tc => !tc.result);
      if (hasRunning) {
        return { phase: 'acting' };
      }
      return { phase: 'observing' };
    }
    if (msg.thinking && !msg.thinkingDone) {
      return { phase: 'reasoning' };
    }
    return { phase: 'reasoning' };
  }

  return { phase: 'done' };
}

/** 从消息的工具调用中估算执行轨迹 */
function estimateTraces(toolCalls: ToolCallState[]): TurnTraceEvent[] {
  if (toolCalls.length === 0) return [];

  // 按开始时间分组（同一秒内的工具调用视为同一轮）
  const groups: ToolCallState[][] = [];
  let currentGroup: ToolCallState[] = [toolCalls[0]];

  for (let i = 1; i < toolCalls.length; i++) {
    const prev = toolCalls[i - 1];
    const curr = toolCalls[i];
    const prevTime = prev.endedAt || prev.startedAt || 0;
    const currTime = curr.startedAt || curr.endedAt || 0;

    // 如果两个工具调用时间差小于 100ms，视为同一轮
    if (currTime - prevTime < 100) {
      currentGroup.push(curr);
    } else {
      groups.push(currentGroup);
      currentGroup = [curr];
    }
  }
  groups.push(currentGroup);

  return groups.map((group, idx) => ({
    type: 'turn_trace' as const,
    turn: idx + 1,
    tools: group.map(tc => tc.name),
    durationMs: group.reduce((sum, tc) => sum + (tc.durationMs || 0), 0),
    tokensUsed: 0, // 无法从消息中推断，需 SSE 事件提供
  }));
}

// ===================== Hook 定义 =====================

export interface UseReactVisibilityOptions {
  /** 是否启用（默认 true） */
  enabled?: boolean;
}

/**
 * 从 Message 列表提取 ReAct 可见性状态
 *
 * @param message - 当前助手消息（通常取 messages 的最后一条 assistant 消息）
 * @param options - 配置选项
 * @returns ReAct 可见性状态
 */
export function useReactVisibility(
  message: Message | undefined,
  options: UseReactVisibilityOptions = {},
): ReactVisibilityState {
  const { enabled = true } = options;

  return useMemo(() => {
    // 未启用或无消息时返回默认空状态
    if (!enabled || !message || message.role !== 'assistant') {
      return {
        currentPhase: 'done',
        toolCalls: [],
        traces: [],
        currentTurn: 0,
        isExecuting: false,
      };
    }

    // 提取当前阶段
    const { phase, step, totalSteps, description } = extractCurrentPhase(message);

    // 提取工具调用状态
    const toolCalls = extractToolCallStates(message);

    // 提取执行计划
    const plan = extractExecutionPlan(message);

    // 估算执行轨迹
    const traces = estimateTraces(toolCalls);

    // 计算当前轮数
    const currentTurn = traces.length || (step ?? 0);

    // 判断是否正在执行
    const isExecuting = !!message.isStreaming;

    return {
      currentPhase: phase,
      currentStep: step,
      totalSteps: totalSteps,
      description: description,
      toolCalls,
      plan,
      traces,
      currentTurn,
      isExecuting,
    };
  }, [enabled, message, message?.isStreaming, message?.reactPhase, message?.toolCalls, message?.executionPlan, message?.toolExecutionStatus]);
}

/**
 * 从 Message 列表中找到最后一条 assistant 消息并提取 ReAct 可见性状态
 *
 * @param messages - 消息列表
 * @param options - 配置选项
 * @returns ReAct 可见性状态
 */
export function useReactVisibilityFromMessages(
  messages: Message[],
  options: UseReactVisibilityOptions = {},
): ReactVisibilityState {
  // 找到最后一条 assistant 消息
  const lastAssistantMsg = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        return messages[i];
      }
    }
    return undefined;
  }, [messages]);

  return useReactVisibility(lastAssistantMsg, options);
}

export default useReactVisibility;
