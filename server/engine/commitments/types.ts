/**
 * Commitments 类型定义
 *
 * 定义承诺跟踪模块的核心类型：承诺类型、敏感度、状态、来源、作用域、
 * 到期窗口、完整记录、存储文件、候选项、提取输入与提取批次结果等。
 *
 * 对齐 openclaw/src/commitments/types.ts，在 cross-wms 中作为独立的承诺跟踪
 * 类型来源，供 store/runtime/上层调度复用。
 */

/** 承诺类型：事件签到 / 截止检查 / 关怀签到 / 开放环 */
export type CommitmentKind =
  | "event_check_in"
  | "deadline_check"
  | "care_check_in"
  | "open_loop";

/** 承诺敏感度：常规 / 个人 / 关怀 */
export type CommitmentSensitivity = "routine" | "personal" | "care";

/** 承诺状态：待处理 / 已发送 / 已忽略 / 已延后 / 已过期 */
export type CommitmentStatus =
  | "pending"
  | "sent"
  | "dismissed"
  | "snoozed"
  | "expired";

/** 承诺来源：从用户上下文推断 / Agent 主动承诺 */
export type CommitmentSource =
  | "inferred_user_context"
  | "agent_promise";

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

/** 完整承诺记录，持久化在存储文件中 */
export type CommitmentRecord = CommitmentScope & {
  /** 记录唯一 ID */
  id: string;
  kind: CommitmentKind;
  sensitivity: CommitmentSensitivity;
  source: CommitmentSource;
  status: CommitmentStatus;
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
  createdAtMs: number;
  updatedAtMs: number;
  /** 已尝试投递次数 */
  attempts: number;
  lastAttemptAtMs?: number;
  sentAtMs?: number;
  dismissedAtMs?: number;
  snoozedUntilMs?: number;
  expiredAtMs?: number;
};

/** 承诺存储文件结构 */
export type CommitmentStoreFile = {
  version: 1;
  commitments: CommitmentRecord[];
};

/** 提取候选项：模型抽取出的待持久化承诺 */
export type CommitmentCandidate = {
  itemId: string;
  kind: CommitmentKind;
  sensitivity: CommitmentSensitivity;
  source: CommitmentSource;
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
  }>;
};

/** 提取批次结果 */
export type CommitmentExtractionBatchResult = {
  candidates: CommitmentCandidate[];
};
