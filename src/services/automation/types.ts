/**
 * 自动化引擎 — 类型定义
 *
 * 包含 TaskType、ActionType、EngineStateEvent、ExecutionStep 等核心类型，
 * 以及 Automation、AutomationExecution、AutomationTemplate 接口。
 */


// ===================== 任务类型 =====================

/** 任务类型 */
export type TaskType = 'data-sync' | 'inventory-snapshot' | 'report-gen' | 'volume-alert' | 'custom';

/** 频率类型 */
export type FreqType = 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY';

/** 任务配置 */
export interface TaskConfig {
  /** data-sync 专用：要同步的数据类别，空则全部 */
  categories?: string[];
  /** volume-alert 专用：容积率预警阈值（0-100） */
  threshold?: number;
  /** report-gen 专用：输出格式 */
  format?: 'json' | 'csv';
  /** 通用：出错时是否通知 */
  notifyOnError?: boolean;
  /** custom 专用：action chain，串行执行 */
  actionChain?: ActionType[];
  /** custom 专用：自定义脚本内容 */
  script?: string;
}

/** custom 任务可执行的原子 action */
export type ActionType = 'sync-warehouses' | 'sync-inventory' | 'sync-transit' | 'snapshot' | 'check-volume' | 'gen-report' | 'notify';

/** 增强版 Automation 类型 */
export interface Automation {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'PAUSED';
  scheduleType: 'recurring' | 'once';
  /** RFC 5545 RRULE string (e.g. FREQ=DAILY;BYHOUR=9) */
  rrule: string;
  /** ISO 8601 datetime for one-time tasks */
  scheduledAt: string;
  /** Human-readable schedule label (cached) */
  scheduleLabel: string;
  /** Task prompt/instruction */
  prompt: string;
  /** 任务类型 */
  taskType: TaskType;
  /** 任务配置 */
  taskConfig?: TaskConfig;
  /** ISO 8601 date/datetime — 调度有效期开始（可选） */
  validFrom?: string;
  /** ISO 8601 date/datetime — 调度有效期结束（可选） */
  validUntil?: string;
  createdAt: string;
  updatedAt: string;
  /** Last execution time */
  lastRunAt: string | null;
  /** Next execution time (computed) */
  nextRunAt: string | null;
  /** Execution count */
  runCount: number;
}

/** 执行记录 */
export interface AutomationExecution {
  id: string;
  automationId: string;
  taskType: TaskType;
  status: 'running' | 'success' | 'failed';
  startedAt: string;
  completedAt: string | null;
  /** 执行耗时（ms） */
  duration: number | null;
  /** 成功消息或错误信息 */
  result: string | null;
  /** 执行步骤详情 */
  steps?: ExecutionStep[];
  /** 是否是重试执行 */
  isRetry?: boolean;
}

/** 执行步骤 */
export interface ExecutionStep {
  action: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  duration: number;
}

/** 引擎状态变更事件 */
export interface EngineStateEvent {
  type: 'execution-start' | 'execution-complete' | 'execution-failed' | 'state-refresh';
  automationId: string;
  execution?: AutomationExecution;
}

/** 引擎公开 API */
export interface AutomationEngineAPI {
  start(): void;
  stop(): void;
  triggerNow(id: string): Promise<AutomationExecution>;
  getExecutionLog(automationId?: string): AutomationExecution[];
  onExecution(callback: (exec: AutomationExecution) => void): () => void;
  onStateChange(callback: (event: EngineStateEvent) => void): () => void;
  isRunning(): boolean;
  /** 重试失败的执行 */
  retry(executionId: string): Promise<AutomationExecution | null>;
  /** 获取执行结果详情（snapshot/report/alert 的 localStorage 数据） */
  getExecutionResults(type: 'snapshots' | 'reports' | 'alerts'): unknown[];
  /** 清空执行日志 */
  clearExecutionLogs(): void;
}

// ===================== 预置模板 =====================

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  taskType: TaskType;
  taskConfig?: TaskConfig;
  defaultSchedule: {
    scheduleType: 'recurring' | 'once';
    freq: FreqType;
    hour: number;
    minute: number;
  };
}

// ===================== 持久化常量 =====================

export const AUTOMATIONS_KEY = 'crosswms-automations';
export const EXECUTION_LOG_KEY = 'crosswms-automation-logs';
export const MAX_LOG_ENTRIES = 100;
export const CHECK_INTERVAL_MS = 30_000; // 30 秒
