/**
 * 自动化引擎 — 类型定义
 *
 * 包含 TaskType、ActionType、EngineStateEvent、ExecutionStep 等核心类型，
 * 以及 Automation、AutomationExecution、AutomationTemplate 接口。
 *
 * v2.0 新增：
 * - TriggerType、TriggerCondition、TriggerConditionGroup
 * - EventTriggerConfig、WebhookConfig、ExecutionPolicy、NotificationConfig
 * - 扩展 Automation、AutomationExecution、EngineStateEvent
 */


// ===================== 触发类型 =====================

/** 触发方式 */
export type TriggerType = 'schedule' | 'event' | 'webhook';

/** 触发条件 */
export interface TriggerCondition {
  field: string;
  operator: '<' | '>' | '<=' | '>=' | '==' | '!=' | 'contains' | 'in';
  value: string | number | boolean | string[];
}

/** 触发条件组（支持 AND/OR 嵌套） */
export interface TriggerConditionGroup {
  operator: 'AND' | 'OR';
  conditions: (TriggerCondition | TriggerConditionGroup)[];
}

/** 事件触发配置 */
export interface EventTriggerConfig {
  eventName: string;
  condition?: TriggerConditionGroup;
  debounceMs?: number; // 默认 0
  triggerMode?: 'once' | 'every'; // 默认 'every'
}

/** Webhook 配置 */
export interface WebhookConfig {
  enabled: boolean;
  /** 后端加密存储，前端仅可重置不可查看明文 */
  secret?: string;
}

/** 执行策略 */
export interface ExecutionPolicy {
  timeoutMs: number;        // 默认 30000
  retry: {
    maxAttempts: number;    // 默认 1
    intervalMs: number;     // 默认 5000
    backoff: 'fixed' | 'exponential'; // 默认 'fixed'
  };
  onFailure: 'stop' | 'continue'; // 默认 'stop'
}

/** 通知配置 */
export interface NotificationConfig {
  channels: ('in-app' | 'webhook' | 'desktop' | 'wechat' | 'dingtalk')[];
  webhookUrl?: string;
  onSuccess: boolean;
  onFailure: boolean;
  template?: string; // 支持 {{variable}} 替换
  wechatKey?: string;
  dingtalkToken?: string;
  dingtalkSecret?: string;
}

// ===================== 任务类型 =====================

/** 任务类型 */
export type TaskType = 'data-sync' | 'inventory-snapshot' | 'report-gen' | 'volume-alert' | 'custom' | 'skill-chain' | 'skill-audit' | 'wms-alert-check' | 'wms-report-gen';

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
  /** skill-chain 专用：链 ID */
  chainId?: string;
  /** skill-audit 专用：要审计的技能 ID 列表，空则审计所有用户技能 */
  skillIds?: string[];
  /** skill-audit 专用：单个技能 ID（从恶意技能卡片跳转时使用） */
  skillId?: string;
  /** wms-alert-check 专用：预警检查配置 */
  alertConfig?: {
    lowStock?: number;      // 低库存阈值，默认 10
    expiryDays?: number;     // 临期天数，默认 30
    stagnantDays?: number;   // 呆滞天数，默认 90
    enableLowStock?: boolean;  // 启用低库存检查
    enableExpiry?: boolean;    // 启用临期检查
    enableStagnant?: boolean;  // 启用呆滞检查
  };
  /** wms-report-gen 专用：报表生成配置 */
  reportConfig?: {
    reportType?: 'inventory' | 'inbound' | 'outbound';  // 报表类型
    warehouseId?: string;                                   // 指定仓库，空则全部
    startDate?: string;                                     // 开始日期
    endDate?: string;                                       // 结束日期
    format?: 'csv' | 'json';                              // 输出格式
  };
}

/** custom 任务可执行的原子 action */
export type ActionType = 'sync-warehouses' | 'sync-inventory' | 'sync-transit' | 'snapshot' | 'check-volume' | 'gen-report' | 'notify' | 'wms-alert-check' | 'wms-report-gen';

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

  // --- v2.0 新增字段（可选，向后兼容）---
  /** 触发方式，默认 'schedule' */
  triggerType?: TriggerType;
  /** 事件触发配置 */
  eventTrigger?: EventTriggerConfig;
  /** Webhook 配置 */
  webhookConfig?: WebhookConfig;
  /** 执行策略 */
  executionPolicy?: ExecutionPolicy;
  /** 通知配置 */
  notificationConfig?: NotificationConfig;
}

/** 执行记录 */
export interface AutomationExecution {
  id: string;
  automationId: string;
  taskType: TaskType;
  status: 'running' | 'success' | 'failed' | 'timeout';
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

  // --- v2.0 新增字段（可选，向后兼容）---
  /** 触发来源 */
  triggerSource?: 'schedule' | 'event' | 'webhook' | 'manual';
  /** 触发详情（JSON 字符串：事件详情 / Webhook payload） */
  triggerDetail?: string;
  /** 本次执行实际重试次数 */
  retryCount?: number;
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
  type: 'execution-start' | 'execution-complete' | 'execution-failed' | 'execution-timeout' | 'state-refresh';
  automationId: string;
  execution?: AutomationExecution;
}

/** 引擎公开 API */
export interface AutomationEngineAPI {
  start(): void;
  stop(): void;
  triggerNow(id: string): Promise<AutomationExecution>;
  getExecutionLog(automationId?: string): Promise<AutomationExecution[]>;
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

// ===================== 常量 =====================

/** v2.0: AUTOMATIONS_KEY 已废弃，数据迁移到后端 SQLite */
export const AUTOMATIONS_KEY = 'cdf-know-clow-automations';
/** v2.0: EXECUTION_LOG_KEY 已废弃，数据迁移到后端 SQLite */
export const EXECUTION_LOG_KEY = 'cdf-know-clow-automation-logs';
/** v2.0: MAX_LOG_ENTRIES 已废弃，后端管理日志保留策略 */
export const MAX_LOG_ENTRIES = 100;
export const CHECK_INTERVAL_MS = 30_000; // 30 秒
