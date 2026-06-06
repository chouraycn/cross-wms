/**
 * 自动化引擎相关类型定义
 */

// ===================== Trigger =====================

/** 触发器类型 */
export type TriggerType = 'schedule' | 'webhook' | 'manual' | 'chain';

/** 事件触发配置 */
export interface EventTriggerConfig {
  enabled: boolean;
  schedule?: string;         // cron 表达式
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEnabled?: boolean;
}

// ===================== Automation Config =====================

/** 自动化任务执行策略 */
export interface ExecutionPolicy {
  timeoutMs: number;
  retryCount: number;
  retryDelayMs: number;
}

/** 自动化通知配置 */
export interface NotificationConfig {
  enabled: boolean;
  channels: ('console' | 'webhook' | 'email')[];
  onSuccess: boolean;
  onFailure: boolean;
  level: 'task' | 'action';
}

/** 自动化完整配置（前端使用） */
export interface AutomationConfig {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'draft';
  triggerType: TriggerType;
  triggerConfig: EventTriggerConfig;
  taskType: string;
  taskConfig: Record<string, unknown>;
  executionPolicy: ExecutionPolicy;
  notificationConfig: NotificationConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

// ===================== Execution Result =====================

/** 单个执行步骤结果 */
export interface ExecutionStep {
  name: string;
  status: 'success' | 'failed' | 'skipped';
  durationMs: number;
  error?: string;
}

/** 执行结果 */
export interface ExecutionResult {
  automationId: string;
  status: 'running' | 'success' | 'failed';
  startTime: string;
  endTime?: string;
  totalDurationMs: number;
  steps: ExecutionStep[];
  data?: Record<string, unknown>;
  error?: string;
}

/** 自动化运行记录 */
export interface AutomationRunRecord {
  id: string;
  automationId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  result: ExecutionResult | null;
  error: string | null;
  triggeredBy: string;
}
