/**
 * Cron Service State - 服务状态管理
 *
 * 定义 cron 服务的依赖注入、事件类型、状态对象及创建函数。
 * 使用简单的可变对象 + 锁机制管理服务状态。
 */

import type { Logger } from "../../../logger.js";
import type {
  CronJob,
  CronStoreFile,
  CronRunStatus,
  CronRunOutcome,
  CronDeliveryStatus,
  CronDeliveryTrace,
  CronFailureNotificationDelivery,
  CronRunDiagnostics,
  CronRunTelemetry,
} from "../types.js";
import type { CronQuarantineEntry } from "../store.js";

/** Cron 事件类型：任务生命周期变化和运行完成时触发 */
export type CronEvent = {
  jobId: string;
  action: "added" | "updated" | "removed" | "started" | "finished";
  /** 事件发生时的任务快照，在可访问任务的所有操作中存在 */
  job?: CronJob;
  runAtMs?: number;
  durationMs?: number;
  status?: CronRunStatus;
  error?: string;
  summary?: string;
  diagnostics?: CronRunDiagnostics;
  delivered?: boolean;
  deliveryStatus?: CronDeliveryStatus;
  deliveryError?: string;
  failureNotificationDelivery?: CronFailureNotificationDelivery;
  delivery?: CronDeliveryTrace;
  sessionId?: string;
  sessionKey?: string;
  runId?: string;
  nextRunAtMs?: number;
} & CronRunTelemetry;

/** 任务执行函数类型 */
export type CronJobExecutor = (job: CronJob) => Promise<CronRunOutcome>;

/** 系统事件入队选项 */
export type EnqueueSystemEventOptions = {
  sessionKey?: string;
  agentId?: string;
  deliveryContext?: unknown;
};

/** 心跳请求选项 */
export type RequestHeartbeatOptions = {
  source: string;
  intent: "immediate" | "event";
  reason: string;
  sessionKey?: string;
  agentId?: string;
};

/** Cron 服务依赖注入接口 */
export type CronServiceDeps = {
  /** 获取当前时间（毫秒），可注入用于测试 */
  nowMs?: () => number;
  /** 日志器 */
  log: Logger;
  /** 存储文件路径 */
  storePath: string;
  /** cron 功能是否启用 */
  cronEnabled: boolean;
  /** 默认 agent id */
  defaultAgentId?: string;
  /** 事件回调 */
  onEvent?: (evt: CronEvent) => void;
  /** 任务执行器，实际执行 cron 任务的逻辑 */
  onJobExecute?: CronJobExecutor;
  /** 将系统事件入队到主会话 */
  enqueueSystemEvent?: (text: string, opts?: EnqueueSystemEventOptions) => unknown;
  /** 请求心跳唤醒 */
  requestHeartbeat?: (opts: RequestHeartbeatOptions) => void;
  /** 隔离 agent 设置超时回调 */
  onIsolatedAgentSetupTimeout?: (info: { job: CronJob; error: string; timeoutMs: number }) => void;
  /** 解析会话存储路径 */
  resolveSessionStorePath?: (agentId: string) => string;
  /** 会话存储路径 */
  sessionStorePath?: string;
  /** 解析原始投递上下文 */
  resolveOriginDeliveryContext?: (opts: { sessionKey?: string; agentId?: string }) => unknown;
};

/** 内部使用的依赖类型，可选字段已补全默认值 */
export type CronServiceDepsInternal = Omit<CronServiceDeps, "nowMs"> & {
  nowMs: () => number;
};

/**
 * Cron 服务可变状态
 *
 * 在 store、任务调度、定时器和操作辅助函数之间共享。
 * 使用 op Promise 链序列化变更操作，确保存储写入和定时器保持有序。
 */
export type CronServiceState = {
  /** 服务依赖（已补全默认值） */
  deps: CronServiceDepsInternal;
  /** 内存中的存储数据 */
  store: CronStoreFile | null;
  /** 定时器句柄 */
  timer: NodeJS.Timeout | null;
  /** 服务是否正在运行 */
  running: boolean;
  /** 服务是否已停止 */
  stopped: boolean;
  /** 重启恢复是否待处理 */
  restartRecoveryPending: boolean;
  /** 当前正在手动运行的任务 id 集合 */
  activeManualRunJobIds: Set<string>;
  /**
   * 操作序列化 Promise 链
   * 用于序列化变更服务的操作，确保存储写入和定时器保持有序
   */
  op: Promise<unknown>;
  /** 是否已警告过 cron 功能被禁用 */
  warnedDisabled: boolean;
  /** 已警告过的无效持久化任务 key 集合 */
  warnedInvalidPersistedJobKeys: Set<string>;
  /** 待处理的隔离配置任务列表 */
  pendingQuarantineConfigJobs: CronQuarantineEntry[];
  /** 上次隔离失败警告的 key */
  lastQuarantineFailureWarnKey: string | null;
  /** 存储加载时间（毫秒） */
  storeLoadedAtMs: number | null;
};

/**
 * 创建 cron 服务状态对象
 *
 * @param deps 服务依赖
 * @returns 初始化的服务状态
 */
export function createCronServiceState(deps: CronServiceDeps): CronServiceState {
  return {
    deps: { ...deps, nowMs: deps.nowMs ?? (() => Date.now()) },
    store: null,
    timer: null,
    running: false,
    stopped: false,
    restartRecoveryPending: false,
    activeManualRunJobIds: new Set<string>(),
    op: Promise.resolve(),
    warnedDisabled: false,
    warnedInvalidPersistedJobKeys: new Set<string>(),
    pendingQuarantineConfigJobs: [],
    lastQuarantineFailureWarnKey: null,
    storeLoadedAtMs: null,
  };
}
