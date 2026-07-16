/**
 * ReAct 引擎前端可见性 — 事件类型定义（T04）
 *
 * 与 server 端 ReActPhaseEvent / onSSEEvent 事件格式对齐，
 * 兼容 SSE 事件流（openclaw-events.ts 中的 SystemEvent.react_phase）。
 */

// ===================== ReAct 阶段类型 =====================

/** ReAct 循环阶段（与 server/engine/reactExecutor.ts ReActPhase 对齐） */
export type ReActPhase = 'reasoning' | 'acting' | 'observing' | 'reflecting' | 'done';

/** ReAct 阶段中文标签映射 */
export const REACT_PHASE_LABELS: Record<ReActPhase, string> = {
  reasoning: '推理',
  acting: '执行',
  observing: '观察',
  reflecting: '反思',
  done: '完成',
};

/** ReAct 阶段显示顺序 */
export const REACT_PHASE_ORDER: ReActPhase[] = [
  'reasoning',
  'acting',
  'observing',
  'reflecting',
  'done',
];

// ===================== 阶段变更事件 =====================

/** ReAct 阶段变更事件（对应 server 端 ReActPhaseEvent） */
export interface ReactPhaseChangeEvent {
  /** 事件类型标识 */
  type: 'react_phase';
  /** 当前阶段 */
  phase: ReActPhase;
  /** 当前步骤序号（1-based） */
  step?: number;
  /** 总步骤数 */
  totalSteps?: number;
  /** 阶段描述文本 */
  description?: string;
  /** 事件时间戳 */
  timestamp?: number;
}

// ===================== 工具调用事件 =====================

/** 工具调用开始事件 */
export interface ToolCallEvent {
  /** 事件类型标识 */
  type: 'tool_call_started';
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数（JSON 字符串） */
  arguments: string;
  /** 事件时间戳 */
  timestamp?: number;
}

/** 工具调用结果事件 */
export interface ToolResultEvent {
  /** 事件类型标识 */
  type: 'tool_call_completed';
  /** 工具调用 ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 执行结果 */
  result: string;
  /** 是否成功 */
  success: boolean;
  /** 执行耗时（毫秒） */
  durationMs?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 事件时间戳 */
  timestamp?: number;
}

// ===================== 反思事件 =====================

/** 反思评估事件 */
export interface ReflectionEvent {
  /** 事件类型标识 */
  type: 'reflect';
  /** 反思来源 */
  source: 'observer' | 'llm' | 'self_evaluation';
  /** 工具名称（可选） */
  toolName?: string;
  /** 评估等级 */
  level: 'success' | 'warning' | 'error' | 'retry_suggested';
  /** 反思洞察 */
  insight: string;
  /** 置信度评分 (1-10) */
  confidenceScore?: number;
  /** 事件时间戳 */
  timestamp?: number;
}

// ===================== 执行轨迹事件 =====================

/** 单轮执行轨迹事件（对应 server 端 turn_trace SSE） */
export interface TurnTraceEvent {
  /** 事件类型标识 */
  type: 'turn_trace';
  /** 轮次（1-based） */
  turn: number;
  /** 本轮使用的工具列表 */
  tools: string[];
  /** 耗时（ms） */
  durationMs: number;
  /** 估算 token 消耗 */
  tokensUsed: number;
  /** 关联的计划步骤序号 */
  planStep?: number;
  /** 事件时间戳 */
  timestamp?: number;
}

// ===================== 预算事件 =====================

/** 预算超出事件 */
export interface BudgetExceededEvent {
  /** 事件类型标识 */
  type: 'budget_exceeded';
  /** 超出原因 */
  reason: string;
  /** 已消耗轮数 */
  consumedTurns: number;
  /** 已消耗 Token 数 */
  consumedTokens: number;
  /** 最大轮数 */
  maxTurns: number;
  /** 最大 Token 数 */
  maxTokens: number;
}

// ===================== 联合类型 =====================

/** ReAct 可见性事件联合类型 */
export type ReactVisibilityEvent =
  | ReactPhaseChangeEvent
  | ToolCallEvent
  | ToolResultEvent
  | ReflectionEvent
  | TurnTraceEvent
  | BudgetExceededEvent;

// ===================== 工具调用状态聚合 =====================

/** 单个工具调用的聚合状态（供 ToolCallCard 消费） */
export interface ToolCallState {
  /** 工具调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数（JSON 字符串） */
  arguments: string;
  /** 执行状态 */
  status: 'running' | 'completed' | 'failed';
  /** 执行结果（完成/失败时有值） */
  result?: string;
  /** 执行耗时（毫秒） */
  durationMs?: number;
  /** 重试次数 */
  retryCount?: number;
  /** 开始时间戳 */
  startedAt?: number;
  /** 结束时间戳 */
  endedAt?: number;
}

/** 执行计划步骤聚合状态（供 ExecutionPlanPanel 消费） */
export interface PlanStepState {
  /** 步骤序号 */
  step: number;
  /** 步骤描述 */
  description: string;
  /** 关联工具名 */
  toolName?: string;
  /** 步骤状态 */
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  /** 依赖步骤序号列表 */
  dependsOn: number[];
}

/** 执行计划聚合状态 */
export interface ExecutionPlanState {
  /** 计划 ID */
  id: string;
  /** 计划意图 */
  intent: string;
  /** 步骤列表 */
  steps: PlanStepState[];
  /** 是否动态计划 */
  isDynamic: boolean;
  /** 创建时间戳 */
  createdAt: string;
}

/** ReAct 全局可见性状态（供 ReactPhaseIndicator 消费） */
export interface ReactVisibilityState {
  /** 当前阶段 */
  currentPhase: ReActPhase;
  /** 当前步骤序号 */
  currentStep?: number;
  /** 总步骤数 */
  totalSteps?: number;
  /** 阶段描述 */
  description?: string;
  /** 工具调用列表 */
  toolCalls: ToolCallState[];
  /** 执行计划 */
  plan?: ExecutionPlanState;
  /** 执行轨迹 */
  traces: TurnTraceEvent[];
  /** 当前轮数 */
  currentTurn: number;
  /** 是否正在执行 */
  isExecuting: boolean;
}
