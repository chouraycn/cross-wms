/**
 * 运行管理器 — 参考 OpenClaw run-state.ts
 *
 * 管理活跃的运行实例、队列、中止和等待机制：
 * - 跟踪活跃运行（防止重复执行）
 * - 支持运行中止（用户取消、重启）
 * - 支持运行等待（用于压缩前等待）
 * - 清理废弃运行（超时自动清理）
 *
 * @module server/engine/runManager
 */

import { logger } from '../logger.js';

// ==================== 类型定义 ====================

/**
 * 运行队列句柄
 *
 * 提供对运行实例的控制接口：
 * - queueMessage: 向运行队列添加消息
 * - isStreaming: 检查是否正在流式输出
 * - isCompacting: 检查是否正在压缩
 * - abort: 中止运行
 * - cancel: 取消运行
 */
export interface RunQueueHandle {
  /** 运行类型标识 */
  kind?: 'embedded' | 'subagent' | 'cron';
  /** 向队列添加消息 */
  queueMessage: (text: string, options?: RunQueueMessageOptions) => Promise<void>;
  /** 是否正在流式输出 */
  isStreaming: () => boolean;
  /** 是否正在压缩 */
  isCompacting: () => boolean;
  /** 是否支持 transcript 提交等待 */
  supportsTranscriptCommitWait?: boolean;
  /** 取消运行（可恢复） */
  cancel?: (reason?: 'user_abort' | 'restart' | 'superseded') => void;
  /** 中止运行（不可恢复） */
  abort: (reason?: 'restart' | 'timeout' | 'error') => void;
  /** 来源回复模式 */
  sourceReplyDeliveryMode?: 'streaming' | 'batch';
}

/**
 * 队列消息选项
 */
export interface RunQueueMessageOptions {
  /** 控制模式 */
  steeringMode?: 'all' | 'single';
  /** 防抖延迟（毫秒） */
  debounceMs?: number;
  /** 投递超时（毫秒） */
  deliveryTimeoutMs?: number;
  /** 是否等待 transcript 提交 */
  waitForTranscriptCommit?: boolean;
  /** 来源回复模式 */
  sourceReplyDeliveryMode?: 'streaming' | 'batch';
}

/**
 * 活跃运行快照
 */
export interface ActiveRunSnapshot {
  /** transcript 叶节点 ID */
  transcriptLeafId: string | null;
  /** 消息列表 */
  messages?: unknown[];
  /** 飞行中的提示词 */
  inFlightPrompt?: string;
  /** 运行元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * 运行等待器
 */
export interface RunWaiter {
  /** 解析函数 */
  resolve: (ended: boolean) => void;
  /** 超时定时器 */
  timer: NodeJS.Timeout;
  /** 等待开始时间 */
  startedAt: number;
}

/**
 * 废弃运行记录
 */
export interface AbandonedRun {
  /** 会话 ID */
  sessionId: string;
  /** 会话 Key */
  sessionKey?: string;
  /** 会话文件路径 */
  sessionFile?: string;
  /** 废弃时间戳（毫秒） */
  abandonedAtMs: number;
  /** 废弃原因 */
  reason: 'timeout' | 'restart' | 'error' | 'superseded';
  /** 错误信息（可选） */
  error?: string;
}

/**
 * 运行状态
 */
export type RunStatus = 'starting' | 'running' | 'streaming' | 'compacting' | 'completed' | 'aborted' | 'failed';

/**
 * 运行记录
 */
export interface RunRecord {
  /** 运行 ID */
  runId: string;
  /** 会话 ID */
  sessionId: string;
  /** 会话 Key */
  sessionKey?: string;
  /** 通道名称 */
  lane: string;
  /** 运行状态 */
  status: RunStatus;
  /** 开始时间 */
  startedAt: number;
  /** 结束时间 */
  endedAt?: number;
  /** 队列句柄 */
  handle?: RunQueueHandle;
  /** 快照 */
  snapshot?: ActiveRunSnapshot;
}

// ==================== 全局状态 ====================

/**
 * 运行状态符号键
 *
 * 使用 Symbol 确保全局唯一性，避免命名冲突
 */
const RUN_STATE_KEY = Symbol.for('cross-wms.runState');

/**
 * 获取全局运行状态
 *
 * 使用惰性初始化，确保进程内只有一个实例
 */
function getRunState() {
  const globalScope = globalThis as Record<symbol, RunState>;
  if (!globalScope[RUN_STATE_KEY]) {
    globalScope[RUN_STATE_KEY] = {
      activeRuns: new Map<string, RunQueueHandle>(),
      runRecords: new Map<string, RunRecord>(),
      snapshots: new Map<string, ActiveRunSnapshot>(),
      sessionIdsByKey: new Map<string, string>(),
      sessionIdsByFile: new Map<string, string>(),
      abandonedRuns: new Map<string, AbandonedRun>(),
      abandonedSessionIdsByKey: new Map<string, string>(),
      abandonedSessionIdsByFile: new Map<string, string>(),
      waiters: new Map<string, Set<RunWaiter>>(),
    };
  }
  return globalScope[RUN_STATE_KEY];
}

/**
 * 运行状态接口
 */
interface RunState {
  activeRuns: Map<string, RunQueueHandle>;
  runRecords: Map<string, RunRecord>;
  snapshots: Map<string, ActiveRunSnapshot>;
  sessionIdsByKey: Map<string, string>;
  sessionIdsByFile: Map<string, string>;
  abandonedRuns: Map<string, AbandonedRun>;
  abandonedSessionIdsByKey: Map<string, string>;
  abandonedSessionIdsByFile: Map<string, string>;
  waiters: Map<string, Set<RunWaiter>>;
}

// ==================== 常量配置 ====================

/** 废弃运行清理阈值（5 分钟） */
const ABANDONED_RUN_CLEANUP_THRESHOLD_MS = 5 * 60 * 1000;

/** 每个会话最大等待器数量 */
const MAX_WAITERS_PER_SESSION = 100;

/** 运行超时默认值（30 分钟） */
const DEFAULT_RUN_TIMEOUT_MS = 30 * 60 * 1000;

// ==================== 活跃运行管理 ====================

/**
 * 注册活跃运行
 *
 * @param sessionId - 会话 ID
 * @param handle - 队列句柄
 */
export function registerActiveRun(sessionId: string, handle: RunQueueHandle): void {
  const state = getRunState();
  state.activeRuns.set(sessionId, handle);
  logger.debug(`[RunManager] 注册活跃运行: ${sessionId}`);
}

/**
 * 注销活跃运行
 *
 * @param sessionId - 会话 ID
 */
export function unregisterActiveRun(sessionId: string): void {
  const state = getRunState();
  state.activeRuns.delete(sessionId);
  state.snapshots.delete(sessionId);
  logger.debug(`[RunManager] 注销活跃运行: ${sessionId}`);
}

/**
 * 获取活跃运行句柄
 *
 * @param sessionId - 会话 ID
 * @returns 队列句柄（如果存在）
 */
export function getActiveRunHandle(sessionId: string): RunQueueHandle | undefined {
  return getRunState().activeRuns.get(sessionId);
}

/**
 * 检查是否有活跃运行
 *
 * @param sessionId - 会话 ID
 * @returns 是否有活跃运行
 */
export function hasActiveRun(sessionId: string): boolean {
  return getRunState().activeRuns.has(sessionId);
}

/**
 * 获取活跃运行数量
 *
 * @returns 活跃运行数量
 */
export function getActiveRunCount(): number {
  return getRunState().activeRuns.size;
}

/**
 * 列出所有活跃运行会话 ID
 *
 * @returns 会话 ID 列表
 */
export function listActiveRunSessionIds(): string[] {
  return Array.from(getRunState().activeRuns.keys());
}

/**
 * 检查运行是否正在流式输出
 *
 * @param sessionId - 会话 ID
 * @returns 是否正在流式输出
 */
export function isRunStreaming(sessionId: string): boolean {
  const handle = getActiveRunHandle(sessionId);
  return handle?.isStreaming() ?? false;
}

/**
 * 检查运行是否正在压缩
 *
 * @param sessionId - 会话 ID
 * @returns 是否正在压缩
 */
export function isRunCompacting(sessionId: string): boolean {
  const handle = getActiveRunHandle(sessionId);
  return handle?.isCompacting() ?? false;
}

// ==================== 运行快照管理 ====================

/**
 * 更新运行快照
 *
 * @param sessionId - 会话 ID
 * @param snapshot - 快照数据
 */
export function updateRunSnapshot(sessionId: string, snapshot: ActiveRunSnapshot): void {
  getRunState().snapshots.set(sessionId, snapshot);
}

/**
 * 获取运行快照
 *
 * @param sessionId - 会话 ID
 * @returns 快照数据（如果存在）
 */
export function getRunSnapshot(sessionId: string): ActiveRunSnapshot | undefined {
  return getRunState().snapshots.get(sessionId);
}

// ==================== 会话 ID 映射 ====================

/**
 * 注册会话 Key 到会话 ID 的映射
 *
 * @param sessionKey - 会话 Key
 * @param sessionId - 会话 ID
 */
export function registerSessionKeyMapping(sessionKey: string, sessionId: string): void {
  getRunState().sessionIdsByKey.set(sessionKey, sessionId);
}

/**
 * 注册会话文件到会话 ID 的映射
 *
 * @param sessionFile - 会话文件路径
 * @param sessionId - 会话 ID
 */
export function registerSessionFileMapping(sessionFile: string, sessionId: string): void {
  getRunState().sessionIdsByFile.set(sessionFile, sessionId);
}

/**
 * 通过 Key 解析会话 ID
 *
 * @param sessionKey - 会话 Key
 * @returns 会话 ID（如果存在）
 */
export function resolveSessionIdByKey(sessionKey: string): string | undefined {
  return getRunState().sessionIdsByKey.get(sessionKey);
}

/**
 * 通过文件解析会话 ID
 *
 * @param sessionFile - 会话文件路径
 * @returns 会话 ID（如果存在）
 */
export function resolveSessionIdByFile(sessionFile: string): string | undefined {
  return getRunState().sessionIdsByFile.get(sessionFile);
}

// ==================== 运行中止 ====================

/**
 * 中止运行
 *
 * @param sessionId - 会话 ID
 * @param reason - 中止原因
 * @returns 是否成功中止
 */
export function abortRun(sessionId: string, reason?: 'restart' | 'timeout' | 'error'): boolean {
  const handle = getActiveRunHandle(sessionId);
  if (!handle) {
    logger.debug(`[RunManager] 尝试中止不存在的运行: ${sessionId}`);
    return false;
  }
  handle.abort(reason);
  unregisterActiveRun(sessionId);
  logger.info(`[RunManager] 已中止运行: ${sessionId}, 原因: ${reason ?? 'unknown'}`);
  return true;
}

/**
 * 取消运行
 *
 * @param sessionId - 会话 ID
 * @param reason - 取消原因
 * @returns 是否成功取消
 */
export function cancelRun(sessionId: string, reason?: 'user_abort' | 'restart' | 'superseded'): boolean {
  const handle = getActiveRunHandle(sessionId);
  if (!handle || !handle.cancel) {
    logger.debug(`[RunManager] 尝试取消不存在的运行或不支持取消: ${sessionId}`);
    return false;
  }
  handle.cancel(reason);
  logger.info(`[RunManager] 已取消运行: ${sessionId}, 原因: ${reason ?? 'unknown'}`);
  return true;
}

/**
 * 中止所有运行
 *
 * @param reason - 中止原因
 * @returns 被中止的运行数量
 */
export function abortAllRuns(reason: 'restart' | 'timeout' | 'error' = 'restart'): number {
  const state = getRunState();
  let count = 0;
  for (const [sessionId, handle] of state.activeRuns) {
    handle.abort(reason);
    state.activeRuns.delete(sessionId);
    state.snapshots.delete(sessionId);
    count++;
  }
  if (count > 0) {
    logger.info(`[RunManager] 已中止所有运行: ${count} 个, 原因: ${reason}`);
  }
  return count;
}

// ==================== 运行等待 ====================

/**
 * 等待运行结束
 *
 * @param sessionId - 会话 ID
 * @param timeoutMs - 超时时间（毫秒）
 * @returns Promise<boolean> - 运行是否正常结束
 */
export async function waitForRunEnd(sessionId: string, timeoutMs = 30000): Promise<boolean> {
  const state = getRunState();

  // 如果运行已经结束，直接返回
  if (!state.activeRuns.has(sessionId)) {
    return true;
  }

  // 创建等待器
  const waiters = state.waiters.get(sessionId) ?? new Set<RunWaiter>();
  if (waiters.size >= MAX_WAITERS_PER_SESSION) {
    logger.warn(`[RunManager] 会话 ${sessionId} 的等待器数量已达上限: ${MAX_WAITERS_PER_SESSION}`);
    return false;
  }

  return new Promise<boolean>((resolve) => {
    const waiter: RunWaiter = {
      resolve: (ended: boolean) => resolve(ended),
      timer: setTimeout(() => {
        waiters.delete(waiter);
        if (waiters.size === 0) {
          state.waiters.delete(sessionId);
        }
        resolve(false); // 超时返回 false
      }, timeoutMs),
      startedAt: Date.now(),
    };

    waiters.add(waiter);
    state.waiters.set(sessionId, waiters);
  });
}

/**
 * 通知运行结束
 *
 * @param sessionId - 会话 ID
 * @param ended - 是否正常结束
 */
export function notifyRunEnded(sessionId: string, ended = true): void {
  const state = getRunState();
  const waiters = state.waiters.get(sessionId);
  if (!waiters) {
    return;
  }

  for (const waiter of waiters) {
    clearTimeout(waiter.timer);
    waiter.resolve(ended);
  }

  state.waiters.delete(sessionId);
}

// ==================== 废弃运行管理 ====================

/**
 * 标记运行为废弃
 *
 * @param sessionId - 会话 ID
 * @param reason - 废弃原因
 * @param error - 错误信息（可选）
 */
export function markRunAbandoned(sessionId: string, reason: AbandonedRun['reason'], error?: string): void {
  const state = getRunState();
  const sessionKey = state.sessionIdsByKey.get(sessionId);
  const sessionFile = state.sessionIdsByFile.get(sessionId);

  const abandoned: AbandonedRun = {
    sessionId,
    sessionKey,
    sessionFile,
    abandonedAtMs: Date.now(),
    reason,
    error,
  };

  state.abandonedRuns.set(sessionId, abandoned);
  if (sessionKey) {
    state.abandonedSessionIdsByKey.set(sessionKey, sessionId);
  }
  if (sessionFile) {
    state.abandonedSessionIdsByFile.set(sessionFile, sessionId);
  }

  // 清理活跃运行
  unregisterActiveRun(sessionId);

  logger.warn(`[RunManager] 标记运行为废弃: ${sessionId}, 原因: ${reason}`);
}

/**
 * 获取废弃运行记录
 *
 * @param sessionId - 会话 ID
 * @returns 废弃运行记录（如果存在）
 */
export function getAbandonedRun(sessionId: string): AbandonedRun | undefined {
  return getRunState().abandonedRuns.get(sessionId);
}

/**
 * 清理过期的废弃运行
 *
 * 移除超过阈值的废弃运行记录
 */
export function cleanupStaleAbandonedRuns(): void {
  const state = getRunState();
  const now = Date.now();
  const threshold = ABANDONED_RUN_CLEANUP_THRESHOLD_MS;

  for (const [sessionId, abandoned] of state.abandonedRuns) {
    if (now - abandoned.abandonedAtMs > threshold) {
      state.abandonedRuns.delete(sessionId);
      if (abandoned.sessionKey) {
        state.abandonedSessionIdsByKey.delete(abandoned.sessionKey);
      }
      if (abandoned.sessionFile) {
        state.abandonedSessionIdsByFile.delete(abandoned.sessionFile);
      }
    }
  }
}

// ==================== 运行记录管理 ====================

/**
 * 创建运行记录
 *
 * @param sessionId - 会话 ID
 * @param lane - 通道名称
 * @returns 运行记录
 */
export function createRunRecord(sessionId: string, lane: string): RunRecord {
  const record: RunRecord = {
    runId: `${sessionId}-${Date.now()}`,
    sessionId,
    lane,
    status: 'starting',
    startedAt: Date.now(),
  };
  getRunState().runRecords.set(sessionId, record);
  return record;
}

/**
 * 更新运行记录状态
 *
 * @param sessionId - 会话 ID
 * @param status - 新状态
 */
export function updateRunStatus(sessionId: string, status: RunStatus): void {
  const state = getRunState();
  const record = state.runRecords.get(sessionId);
  if (record) {
    record.status = status;
    if (status === 'completed' || status === 'aborted' || status === 'failed') {
      record.endedAt = Date.now();
    }
  }
}

/**
 * 获取运行记录
 *
 * @param sessionId - 会话 ID
 * @returns 运行记录（如果存在）
 */
export function getRunRecord(sessionId: string): RunRecord | undefined {
  return getRunState().runRecords.get(sessionId);
}

// ==================== 诊断接口 ====================

/**
 * 获取运行管理器诊断信息
 *
 * @returns 诊断信息对象
 */
export function getRunManagerDiagnostics(): {
  activeRuns: number;
  abandonedRuns: number;
  waiters: number;
  sessionKeyMappings: number;
  sessionFileMappings: number;
} {
  const state = getRunState();
  return {
    activeRuns: state.activeRuns.size,
    abandonedRuns: state.abandonedRuns.size,
    waiters: state.waiters.size,
    sessionKeyMappings: state.sessionIdsByKey.size,
    sessionFileMappings: state.sessionIdsByFile.size,
  };
}