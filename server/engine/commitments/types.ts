/**
 * Commitments 类型定义
 *
 * 定义承诺跟踪模块的核心类型：承诺类型、敏感度、状态、来源、作用域、
 * 到期窗口、完整记录、存储文件、候选项、提取输入与提取批次结果、
 * 心跳策略、过滤器、分页、统计等。
 *
 * 对齐 openclaw/src/commitments/types.ts，在 cross-wms 中作为独立的承诺跟踪
 * 类型来源，供 store/runtime/上层调度复用。
 */

/** 承诺类型：事件签到 / 截止检查 / 关怀签到 / 开放环 / 跟进 / 提醒 / 紧急 */
export type CommitmentKind =
  | "event_check_in"
  | "deadline_check"
  | "care_check_in"
  | "open_loop"
  | "follow_up"
  | "reminder"
  | "urgent"
  | "care";

/** 承诺敏感度：常规 / 个人 / 关怀 */
export type CommitmentSensitivity = "routine" | "personal" | "care" | "normal";

/** 承诺状态：待处理 / 已发送 / 已忽略 / 已延后 / 已过期 / 已完成 / 失败 */
export type CommitmentStatus =
  | "pending"
  | "sent"
  | "dismissed"
  | "snoozed"
  | "expired"
  | "completed"
  | "failed";

/** 承诺来源：从用户上下文推断 / Agent 主动承诺 / 手动创建 / 系统生成 */
export type CommitmentSource =
  | "inferred_user_context"
  | "agent_promise"
  | "manual"
  | "system";

/** 承诺优先级：低 / 中 / 高 / 紧急 */
export type CommitmentPriority = "low" | "medium" | "high" | "urgent";

/** 承诺作用域：定位某一条承诺的会话/通道/收件人上下文 */
export type CommitmentScope = {
  agentId: string;
  sessionKey: string;
  channel: string;
  accountId?: string;
  to?: string;
  threadId?: string;
  senderId?: string;
};

/** 承诺到期窗口：最早/最晚触发毫秒时间戳及解释用的时区 */
export type CommitmentDueWindow = {
  earliestMs: number;
  latestMs: number;
  timezone: string;
};

/** 心跳记录：承诺心跳触发的投递尝试记录 */
export type CommitmentHeartbeat = {
  id: string;
  commitmentId: string;
  heartbeatAtMs: number;
  status: "triggered" | "skipped" | "delivered" | "failed";
  deliveryChannel?: string;
  deliveryMessageId?: string;
  skipReason?: string;
  errorMessage?: string;
};

/** 承诺过滤器：用于查询和筛选承诺 */
export type CommitmentFilter = {
  status?: CommitmentStatus | CommitmentStatus[];
  kind?: CommitmentKind | CommitmentKind[];
  sensitivity?: CommitmentSensitivity | CommitmentSensitivity[];
  source?: CommitmentSource | CommitmentSource[];
  priority?: CommitmentPriority | CommitmentPriority[];
  agentId?: string;
  sessionKey?: string;
  channel?: string;
  accountId?: string;
  to?: string;
  threadId?: string;
  senderId?: string;
  dedupeKey?: string;
  createdAfterMs?: number;
  createdBeforeMs?: number;
  updatedAfterMs?: number;
  updatedBeforeMs?: number;
  dueAfterMs?: number;
  dueBeforeMs?: number;
  minConfidence?: number;
  maxConfidence?: number;
  minAttempts?: number;
  maxAttempts?: number;
  hasSourceMessageId?: boolean;
  searchQuery?: string;
};

/** 分页参数 */
export type PaginationParams = {
  page?: number;
  pageSize?: number;
  offset?: number;
  limit?: number;
};

/** 排序字段 */
export type CommitmentSortField =
  | "createdAtMs"
  | "updatedAtMs"
  | "earliestMs"
  | "latestMs"
  | "confidence"
  | "attempts"
  | "priority"
  | "status";

/** 排序参数 */
export type SortParams = {
  field: CommitmentSortField;
  order?: "asc" | "desc";
};

/** 分页结果 */
export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/** 承诺统计信息 */
export type CommitmentStats = {
  total: number;
  byStatus: Record<CommitmentStatus, number>;
  byKind: Record<CommitmentKind, number>;
  bySensitivity: Record<CommitmentSensitivity, number>;
  byPriority: Record<CommitmentPriority, number>;
  pending: number;
  active: number;
  completedToday: number;
  expiredToday: number;
  sentToday: number;
  failedToday: number;
  averageConfidence: number;
  averageAttempts: number;
};

/** 完整承诺记录，持久化在存储文件中 */
export type CommitmentRecord = CommitmentScope & {
  /** 记录唯一 ID */
  id: string;
  kind: CommitmentKind;
  sensitivity: CommitmentSensitivity;
  source: CommitmentSource;
  status: CommitmentStatus;
  /** 优先级 */
  priority: CommitmentPriority;
  /** 触发该承诺的人类可读原因 */
  reason: string;
  /** 建议发送的文案 */
  suggestedText: string;
  /** 去重键，同一作用域下相同 dedupeKey 视为同一承诺 */
  dedupeKey: string;
  /** 提取置信度，0~1 */
  confidence: number;
  dueWindow: CommitmentDueWindow;
  /** 触发该承诺的消息 ID */
  sourceMessageId?: string;
  /** 触发该承诺的运行 ID */
  sourceRunId?: string;
  /** @deprecated 早期存储的遗留字段，不应回放到投递 prompt */
  sourceUserText?: string;
  /** @deprecated 早期存储的遗留字段，不应回放到投递 prompt */
  sourceAssistantText?: string;
  /** 标签，用于分类和过滤 */
  tags?: string[];
  /** 元数据，用于存储额外信息 */
  metadata?: Record<string, unknown>;
  createdAtMs: number;
  updatedAtMs: number;
  /** 已尝试投递次数 */
  attempts: number;
  lastAttemptAtMs?: number;
  sentAtMs?: number;
  dismissedAtMs?: string | number;
  snoozedUntilMs?: number;
  expiredAtMs?: number;
  completedAtMs?: number;
  failedAtMs?: number;
  /** 失败原因 */
  failureReason?: string;
  /** 完成验证结果 */
  completionVerified?: boolean;
  /** 完成验证时间 */
  completionVerifiedAtMs?: number;
};

/** 承诺存储文件结构 */
export type CommitmentStoreFile = {
  version: 1;
  commitments: CommitmentRecord[];
  heartbeats?: CommitmentHeartbeat[];
};

/** 提取候选项：模型抽取出的待持久化承诺 */
export type CommitmentCandidate = {
  itemId: string;
  kind: CommitmentKind;
  sensitivity: CommitmentSensitivity;
  source: CommitmentSource;
  priority?: CommitmentPriority;
  reason: string;
  suggestedText: string;
  dedupeKey: string;
  confidence: number;
  dueWindow: {
    /** ISO 8601 字符串或可解析的时间表达 */
    earliest: string;
    latest?: string;
    timezone?: string;
  };
  tags?: string[];
  metadata?: Record<string, unknown>;
};

/** 提取输入项：单条待抽取的会话回合 */
export type CommitmentExtractionItem = CommitmentScope & {
  itemId: string;
  nowMs: number;
  timezone: string;
  userText: string;
  assistantText?: string;
  sourceMessageId?: string;
  sourceRunId?: string;
  /** 当前作用域内已存在的待处理承诺，用于模型去重判断 */
  existingPending: Array<{
    kind: CommitmentKind;
    reason: string;
    dedupeKey: string;
    earliestMs: number;
    latestMs: number;
    priority?: CommitmentPriority;
  }>;
};

/** 提取批次结果 */
export type CommitmentExtractionBatchResult = {
  candidates: CommitmentCandidate[];
  /** 提取过程中的警告或备注 */
  warnings?: string[];
  /** 提取耗时（毫秒） */
  extractionMs?: number;
};

/** 心跳策略配置 */
export type HeartbeatPolicyConfig = {
  /** 是否启用心跳 */
  enabled: boolean;
  /** 心跳间隔（毫秒） */
  intervalMs: number;
  /** 单次心跳最多投递条数 */
  maxPerHeartbeat: number;
  /** 心跳目标：none / last / all */
  target: "none" | "last" | "all";
  /** 投递时是否禁用工具 */
  disableTools: boolean;
  /** 失败重试次数 */
  maxRetries: number;
  /** 重试间隔（毫秒） */
  retryIntervalMs: number;
  /** 退避因子 */
  backoffFactor: number;
};

/** 心跳运行结果 */
export type HeartbeatRunResult = {
  status: "ran" | "skipped" | "error";
  commitmentsChecked: number;
  commitmentsDelivered: number;
  commitmentsFailed: number;
  skippedReason?: string;
  errorMessage?: string;
  startedAtMs: number;
  endedAtMs: number;
};

/** 完成验证结果 */
export type CompletionVerificationResult = {
  isCompleted: boolean;
  confidence: number;
  reason: string;
  verifiedAtMs: number;
  evidence?: string[];
};
