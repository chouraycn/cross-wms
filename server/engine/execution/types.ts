/**
 * Execution 模块类型定义
 *
 * 定义执行引擎的核心类型，包括：
 * - 执行上下文
 * - 执行步骤
 * - 执行结果
 * - 执行状态
 * - 工具注册
 */

/** 执行状态 */
export type ExecutionStatus =
  | 'idle'
  | 'pending'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

/** 执行步骤类型 */
export type StepType = 'tool_call' | 'condition' | 'parallel' | 'loop' | 'subflow';

/** 执行步骤 */
export interface ExecutionStep {
  /** 步骤唯一 ID */
  id: string;
  /** 步骤类型 */
  type: StepType;
  /** 步骤名称 */
  name: string;
  /** 工具名称（tool_call 类型） */
  toolName?: string;
  /** 工具参数 */
  toolArgs?: Record<string, unknown>;
  /** 超时时间（毫秒） */
  timeoutMs?: number;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试延迟（毫秒） */
  retryDelayMs?: number;
  /** 是否关键步骤（失败则整体失败） */
  critical?: boolean;
  /** 子步骤（parallel/loop/subflow） */
  children?: ExecutionStep[];
  /** 条件表达式（condition 类型） */
  condition?: string;
  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/** 步骤执行结果 */
export interface StepResult {
  /** 步骤 ID */
  stepId: string;
  /** 步骤名称 */
  stepName: string;
  /** 执行状态 */
  status: ExecutionStatus;
  /** 输出结果 */
  output?: unknown;
  /** 错误信息 */
  error?: string;
  /** 重试次数 */
  retries: number;
  /** 开始时间（毫秒） */
  startedAt: number;
  /** 结束时间（毫秒） */
  endedAt?: number;
  /** 持续时间（毫秒） */
  durationMs?: number;
}

/** 执行结果 */
export interface ExecutionResult {
  /** 执行 ID */
  executionId: string;
  /** 整体状态 */
  status: ExecutionStatus;
  /** 所有步骤结果 */
  stepResults: StepResult[];
  /** 成功步骤数 */
  successCount: number;
  /** 失败步骤数 */
  failedCount: number;
  /** 跳过步骤数 */
  skippedCount: number;
  /** 开始时间（毫秒） */
  startedAt: number;
  /** 结束时间（毫秒） */
  endedAt?: number;
  /** 总持续时间（毫秒） */
  totalDurationMs?: number;
  /** 错误信息（若整体失败） */
  error?: string;
  /** 最终输出 */
  finalOutput?: unknown;
}

/** 执行上下文 */
export interface ExecutionContext {
  /** 执行 ID */
  executionId: string;
  /** 会话 ID */
  sessionId?: string;
  /** 执行器标识 */
  executor?: string;
  /** 变量存储 */
  variables: Map<string, unknown>;
  /** 步骤结果存储 */
  stepResults: Map<string, StepResult>;
  /** 中止信号 */
  abortSignal?: AbortSignal;
  /** 当前步骤索引 */
  currentStepIndex: number;
  /** 是否暂停 */
  isPaused: boolean;
  /** 元数据 */
  metadata: Record<string, unknown>;
}

/** 执行配置 */
export interface ExecutionConfig {
  /** 全局超时（毫秒） */
  timeoutMs?: number;
  /** 全局最大重试次数 */
  maxRetries?: number;
  /** 全局重试延迟（毫秒） */
  retryDelayMs?: number;
  /** 失败时是否继续（非关键步骤） */
  continueOnFailure?: boolean;
  /** 并发度（并行步骤） */
  concurrency?: number;
}

/** 工具执行函数 */
export type ToolExecutor = (
  toolName: string,
  toolArgs: Record<string, unknown>,
  context: ExecutionContext,
) => Promise<unknown>;

/** 工具注册信息 */
export interface ToolRegistration {
  name: string;
  description?: string;
  executor: ToolExecutor;
  /** 是否为安全工具（无需审批） */
  safe?: boolean;
  /** 风险等级 */
  riskLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
}

/** 执行事件类型 */
export type ExecutionEventType =
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  | 'execution_cancelled'
  | 'step_started'
  | 'step_completed'
  | 'step_failed'
  | 'step_retry'
  | 'paused'
  | 'resumed';

/** 执行事件 */
export interface ExecutionEvent {
  type: ExecutionEventType;
  executionId: string;
  stepId?: string;
  data?: unknown;
  timestamp: number;
}
