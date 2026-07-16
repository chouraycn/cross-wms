/**
 * Cron 类型定义
 *
 * 定义 cron 模块的核心类型：调度、会话目标、唤醒模式、投递、运行状态、
 * 任务配置、payload、失败告警、存储文件、诊断信息和运行结果等。
 */

/** 调度类型：at / every / cron */
export type CronSchedule =
  | { kind: "at"; at: string | number }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | {
      kind: "cron";
      expr: string;
      tz?: string;
      /** 可选的确定性错峰窗口（毫秒），0 表示保持精确调度 */
      staggerMs?: number;
    };

/** 运行时会话目标：决定任务加入主会话、隔离会话还是命名会话 */
export type CronSessionTarget = "main" | "isolated" | "current" | `session:${string}`;

/** 主会话任务的唤醒策略：等待心跳/用户活动 */
export type CronWakeMode = "next-heartbeat" | "now";

/** 投递模式 */
export type CronDeliveryMode = "none" | "announce" | "webhook";

/** 完成投递目标（webhook 形式，与聊天投递配合使用） */
export type CronCompletionDestination = {
  mode: "webhook";
  to?: string;
};

/** 失败通知的目标覆盖 */
export type CronFailureDestination = {
  channel?: string;
  to?: string;
  accountId?: string;
  mode?: "announce" | "webhook";
};

/** 失败通知目标的部分更新形式；null 表示清除对应字段 */
export type CronFailureDestinationPatch = {
  channel?: string | null;
  to?: string | null;
  accountId?: string | null;
  mode?: "announce" | "webhook" | null;
};

/** cron 任务输出的完成投递配置 */
export type CronDelivery = {
  mode: CronDeliveryMode;
  channel?: string;
  to?: string;
  /** 支持线程投递的通道的显式线程/主题 ID */
  threadId?: string | number;
  /** 多账号配置的显式通道账号 ID（如多个 Telegram 机器人） */
  accountId?: string;
  bestEffort?: boolean;
  /** 当任务必须保持聊天投递时使用的额外 webhook 目标 */
  completionDestination?: CronCompletionDestination;
  /** 失败通知的独立目标 */
  failureDestination?: CronFailureDestination;
};

/** 投递的部分更新形式；null 表示清除可选的投递目标或字段 */
export type CronDeliveryPatch = Partial<Pick<CronDelivery, "mode" | "bestEffort">> & {
  channel?: string | null;
  to?: string | null;
  threadId?: string | number | null;
  accountId?: string | null;
  completionDestination?: CronCompletionDestination | null;
  failureDestination?: CronFailureDestinationPatch | null;
};

/** 执行结果状态，与投递结果分开 */
export type CronRunStatus = "ok" | "error" | "skipped";

/** 完成或失败通知发送的投递结果 */
export type CronDeliveryStatus = "delivered" | "not-delivered" | "unknown" | "not-requested";

/** 投递目标快照，用于审计/调试输出 */
export type CronDeliveryTraceTarget = {
  channel?: string;
  to?: string | null;
  accountId?: string;
  threadId?: string | number;
  source?: "explicit" | "last";
};

/** 已发送到 cron 投递目标的消息工具目标 */
export type CronDeliveryTraceMessageTarget = {
  channel: string;
  to?: string;
  accountId?: string;
  threadId?: string;
};

/** 一次运行的预期、已解析和已发送投递决策的追踪记录 */
export type CronDeliveryTrace = {
  intended?: CronDeliveryTraceTarget;
  resolved?: CronDeliveryTraceTarget & { ok: boolean; error?: string };
  messageToolSentTo?: CronDeliveryTraceMessageTarget[];
  fallbackUsed?: boolean;
  delivered?: boolean;
};

/** 上次失败运行通知的投递状态，存储在任务状态和运行日志中 */
export type CronFailureNotificationDelivery = {
  /** 上次失败运行的失败通知是否到达目标通道 */
  delivered?: boolean;
  status: CronDeliveryStatus;
  error?: string;
};

/** 人类可读的投递目标预览，用于列表/详情展示 */
export type CronDeliveryPreview = {
  label: string;
  detail: string;
};

/** Token 使用摘要，从 agent runner 复制（当可用时） */
export type CronUsageSummary = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
};

/** 附加到 cron 运行结果和日志的模型/提供商/使用遥测数据 */
export type CronRunTelemetry = {
  model?: string;
  provider?: string;
  usage?: CronUsageSummary;
};

/** 持久化 cron 运行诊断的严重级别 */
export type CronRunDiagnosticSeverity = "info" | "warn" | "error";

/** 产生 cron 运行诊断条目的子系统 */
export type CronRunDiagnosticSource =
  | "cron-preflight"
  | "cron-setup"
  | "model-preflight"
  | "agent-run"
  | "tool"
  | "exec"
  | "delivery";

/** 带时间戳的诊断条目，用于 cron 运行故障排查 */
export type CronRunDiagnostic = {
  ts: number;
  source: CronRunDiagnosticSource;
  severity: CronRunDiagnosticSeverity;
  message: string;
  toolName?: string;
  exitCode?: number | null;
  truncated?: boolean;
};

/** 存储在运行结果中的有界诊断包 */
export type CronRunDiagnostics = {
  summary?: string;
  entries: CronRunDiagnostic[];
};

/** 执行结果，持久化在 cron 状态、运行日志和隔离回合结果中 */
export type CronRunOutcome = {
  status: CronRunStatus;
  error?: string;
  /** 可选的执行错误分类器，用于指导回退行为 */
  errorKind?: "delivery-target";
  summary?: string;
  sessionId?: string;
  sessionKey?: string;
  diagnostics?: CronRunDiagnostics;
  telemetry?: CronRunTelemetry;
};

/** 失败告警策略，持久化在 cron 任务上 */
export type CronFailureAlert = {
  after?: number;
  channel?: string;
  to?: string;
  cooldownMs?: number;
  /** 为 true 时，连续跳过的运行也计入告警阈值 */
  includeSkipped?: boolean;
  /** 投递模式：announce（通过消息通道）或 webhook（HTTP POST） */
  mode?: "announce" | "webhook";
  /** 多账号通道配置的账号 ID */
  accountId?: string;
};

/** Agent 回合 payload 字段 */
type CronAgentTurnPayloadFields = {
  message: string;
  /** 可选的模型覆盖（提供商/模型或别名） */
  model?: string;
  /** 可选的每任务回退模型；定义时覆盖 agent/全局回退 */
  fallbacks?: string[];
  thinking?: string;
  timeoutSeconds?: number;
  allowUnsafeExternalContent?: boolean;
  /** 如果为 true，使用轻量级引导上下文运行 */
  lightContext?: boolean;
  /** 可选的工具白名单；设置时仅这些工具会发送给模型 */
  toolsAllow?: string[];
};

/** Agent 回合 payload */
type CronAgentTurnPayload = {
  kind: "agentTurn";
} & CronAgentTurnPayloadFields;

/** Agent 回合 payload 的部分更新形式 */
type CronAgentTurnPayloadPatch = {
  kind: "agentTurn";
} & Partial<Omit<CronAgentTurnPayloadFields, "model" | "fallbacks" | "toolsAllow">> & {
    model?: string | null;
    fallbacks?: string[] | null;
    toolsAllow?: string[] | null;
  };

/** 命令 payload 字段 */
type CronCommandPayloadFields = {
  /** 显式 argv 向量执行。使用 shell 包装 argv 以支持 shell 语法 */
  argv: string[];
  cwd?: string;
  env?: Record<string, string>;
  input?: string;
  timeoutSeconds?: number;
  noOutputTimeoutSeconds?: number;
  outputMaxBytes?: number;
};

/** 命令 payload */
type CronCommandPayload = {
  kind: "command";
} & CronCommandPayloadFields;

/** 命令 payload 的部分更新形式 */
type CronCommandPayloadPatch = {
  kind: "command";
} & Partial<CronCommandPayloadFields>;

/** cron 可在主会话或隔离模式下执行的 payload 变体 */
export type CronPayload =
  | { kind: "systemEvent"; text: string }
  | CronAgentTurnPayload
  | CronCommandPayload;

/** payload 的部分更新形式，用于 cron 补丁/编辑流程 */
export type CronPayloadPatch =
  | { kind: "systemEvent"; text?: string }
  | CronAgentTurnPayloadPatch
  | CronCommandPayloadPatch;

/** 可变运行时状态，与不可变的 cron 任务规格一起持久化 */
export type CronJobState = {
  nextRunAtMs?: number;
  runningAtMs?: number;
  lastRunAtMs?: number;
  /** 首选的执行结果字段 */
  lastRunStatus?: CronRunStatus;
  /** @deprecated 使用 lastRunStatus */
  lastStatus?: "ok" | "error" | "skipped";
  lastError?: string;
  lastDiagnostics?: CronRunDiagnostics;
  lastDiagnosticSummary?: string;
  /** 上次错误的分类原因（当可用时） */
  lastErrorReason?: string;
  lastDurationMs?: number;
  /** 上次成功运行的时间戳（毫秒） */
  lastSuccessAtMs?: number;
  /** 连续执行错误次数（成功时重置），用于退避 */
  consecutiveErrors?: number;
  /** 连续跳过执行次数（成功或出错时重置） */
  consecutiveSkipped?: number;
  /** 上次失败告警时间戳（毫秒纪元），用于冷却门控 */
  lastFailureAlertAtMs?: number;
  /** 连续调度计算错误次数。超过阈值后自动禁用任务 */
  scheduleErrorCount?: number;
  /** 显式投递结果，与执行结果分开 */
  lastDeliveryStatus?: CronDeliveryStatus;
  /** 投递特定的错误文本（当可用时） */
  lastDeliveryError?: string;
  /** 上次运行的输出是否投递到目标通道 */
  lastDelivered?: boolean;
  /** 上次失败运行的失败通知是否投递到目标通道 */
  lastFailureNotificationDelivered?: boolean;
  /** 上次失败运行的失败通知的投递结果 */
  lastFailureNotificationDeliveryStatus?: CronDeliveryStatus;
  /** 上次失败运行的失败通知的投递特定错误 */
  lastFailureNotificationDeliveryError?: string;
};

/** 共享的持久化 cron 任务信封，由运行时和外部配置形状使用 */
export type CronJobBase<TSchedule, TSessionTarget, TWakeMode, TPayload, TDelivery, TFailureAlert> = {
  id: string;
  agentId?: string;
  sessionKey?: string;
  name: string;
  description?: string;
  enabled: boolean;
  deleteAfterRun?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  schedule: TSchedule;
  sessionTarget: TSessionTarget;
  wakeMode: TWakeMode;
  payload: TPayload;
  delivery?: TDelivery;
  failureAlert?: TFailureAlert;
};

/** 完整持久化的 cron 任务，包含规格字段和可变运行状态 */
export type CronJob = CronJobBase<
  CronSchedule,
  CronSessionTarget,
  CronWakeMode,
  CronPayload,
  CronDelivery,
  CronFailureAlert | false
> & {
  state: CronJobState;
};

/** 版本化的 cron 存储文件形状 */
export type CronStoreFile = {
  version: 1;
  jobs: CronJob[];
};

/** cron API 接受的创建输入（在分配 id/时间戳/状态之前） */
export type CronJobCreate = Omit<CronJob, "id" | "createdAtMs" | "updatedAtMs" | "state"> & {
  state?: Partial<CronJobState>;
};

/** cron API 接受的补丁输入（不允许修改不可变的标识字段） */
export type CronJobPatch = Partial<
  Omit<CronJob, "id" | "createdAtMs" | "state" | "payload" | "delivery">
> & {
  payload?: CronPayloadPatch;
  delivery?: CronDeliveryPatch;
  state?: Partial<CronJobState>;
};
