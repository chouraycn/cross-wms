/**
 * Event-Loop 健康监控模块
 *
 * 参考 OpenClaw 的 src/logging/diagnostic.ts 设计
 * - Event-Loop delay 监控（perf_hooks.monitorEventLoopDelay）
 * - CPU 利用率监控（os.cpus() 差分）
 * - Liveness 阈值告警（event-loop / utilization / cpu，带冷却）
 * - Stuck session 检测（120s warn / 5min abort / 3x 倍数重发）
 * - 每 10s 采样一次，unref 不阻塞进程退出
 */

import { monitorEventLoopDelay } from 'node:perf_hooks';
import { cpus } from 'node:os';
import { logger } from '../logger.js';

/** Liveness 阈值 */
const EVENT_LOOP_DELAY_THRESHOLD_MS = 1000; // 1s
const UTILIZATION_THRESHOLD = 0.95;         // 单核峰值利用率
const CPU_THRESHOLD = 0.9;                  // 平均 CPU 使用率
const LIVENESS_COOLDOWN_MS = 120_000;       // 120s 同类告警冷却

/** Stuck session 阈值 */
const STUCK_WARN_MS = 120_000;              // 120s 触发 warn
const STUCK_ABORT_MS = 5 * 60_000;          // 5min 触发 abort
const STUCK_ABORT_MULTIPLIER = 3;           // abort 按 3x 倍数重发（5min → 15min → 45min ...）

/** 采样间隔 */
const SAMPLE_INTERVAL_MS = 10_000;          // 10s

/** 健康快照 */
export interface DiagnosticHealthSnapshot {
  /** Event-Loop 最大延迟（ms） */
  eventLoopDelayMs: number;
  /** 平均 CPU 使用率（0-1） */
  cpuUsage: number;
  /** 单核峰值利用率（0-1） */
  utilization: number;
  /** 是否存活（未超阈） */
  isAlive: boolean;
  /** 最近一次采样时间（ISO） */
  lastCheckAt: string;
}

/** 卡死会话信息 */
export interface StuckSessionInfo {
  sessionKey: string;
  /** 会话开始时间（ISO） */
  startedAt: string;
  /** 最近一次活动时间（ISO） */
  lastActivityAt: string;
  /** 卡死持续时长（ms） */
  durationMs: number;
  /** 严重程度：warn=告警, abort=中止 */
  severity: 'warn' | 'abort';
}

interface SessionRecord {
  sessionKey: string;
  startedAt: number;
  lastActivityAt: number;
  warnAnnounced: boolean;
  /** 上次 abort 告警对应的 durationMs（用于 3x 倍数重发） */
  abortAnnouncedDuration: number | null;
}

interface CpuSample {
  perCoreIdle: number[];
  perCoreTotal: number[];
}

interface HealthState {
  monitor: ReturnType<typeof monitorEventLoopDelay>;
  timer: NodeJS.Timeout | null;
  lastLivenessAtByKey: Map<string, number>;
  prevCpu: CpuSample | null;
  sessions: Map<string, SessionRecord>;
  lastSnapshot: DiagnosticHealthSnapshot;
}

const state: HealthState = {
  monitor: monitorEventLoopDelay(),
  timer: null,
  lastLivenessAtByKey: new Map(),
  prevCpu: null,
  sessions: new Map(),
  lastSnapshot: {
    eventLoopDelayMs: 0,
    cpuUsage: 0,
    utilization: 0,
    isAlive: true,
    lastCheckAt: new Date(0).toISOString(),
  },
};

state.monitor.enable();

/** 采样当前 CPU 各核 idle/total */
function sampleCpus(): CpuSample {
  const cores = cpus();
  return {
    perCoreIdle: cores.map(c => c.times.idle),
    perCoreTotal: cores.map(c => Object.values(c.times).reduce((a, b) => a + b, 0)),
  };
}

/** 计算两次 CPU 采样的使用率差分 */
function computeCpuDelta(prev: CpuSample, curr: CpuSample): { cpuUsage: number; utilization: number } {
  const perCoreBusy: number[] = [];
  for (let i = 0; i < curr.perCoreTotal.length; i++) {
    const totalDelta = curr.perCoreTotal[i] - (prev.perCoreTotal[i] ?? curr.perCoreTotal[i]);
    const idleDelta = curr.perCoreIdle[i] - (prev.perCoreIdle[i] ?? curr.perCoreIdle[i]);
    if (totalDelta <= 0) {
      perCoreBusy.push(0);
      continue;
    }
    perCoreBusy.push(1 - Math.max(0, idleDelta) / totalDelta);
  }
  if (perCoreBusy.length === 0) return { cpuUsage: 0, utilization: 0 };
  const cpuUsage = perCoreBusy.reduce((a, b) => a + b, 0) / perCoreBusy.length;
  const utilization = perCoreBusy.reduce((a, b) => Math.max(a, b), 0);
  return { cpuUsage, utilization };
}

/** 读取并重置 Event-Loop 最大延迟（ms） */
function readAndResetEventLoopDelay(): number {
  const maxNs = state.monitor.max;
  state.monitor.reset();
  return Number.isFinite(maxNs) ? maxNs / 1e6 : 0;
}

/** Liveness 阈值检查，超阈时按冷却输出日志 */
function checkLiveness(metrics: { eventLoopDelayMs: number; cpuUsage: number; utilization: number }, now: number): boolean {
  const reasons: string[] = [];
  if (metrics.eventLoopDelayMs > EVENT_LOOP_DELAY_THRESHOLD_MS) reasons.push('eventloop');
  if (metrics.utilization > UTILIZATION_THRESHOLD) reasons.push('utilization');
  if (metrics.cpuUsage > CPU_THRESHOLD) reasons.push('cpu');

  const alive = reasons.length === 0;
  if (alive) return true;

  for (const reason of reasons) {
    const last = state.lastLivenessAtByKey.get(reason) ?? 0;
    if (now - last < LIVENESS_COOLDOWN_MS) continue;
    state.lastLivenessAtByKey.set(reason, now);
    logger.error(
      `[Diagnostic] liveness 超阈 reason=${reason} ` +
        `eventLoopDelayMs=${metrics.eventLoopDelayMs.toFixed(1)} ` +
        `cpuUsage=${metrics.cpuUsage.toFixed(3)} ` +
        `utilization=${metrics.utilization.toFixed(3)} ` +
        `（阈值: el=${EVENT_LOOP_DELAY_THRESHOLD_MS}ms util=${UTILIZATION_THRESHOLD} cpu=${CPU_THRESHOLD}）`,
    );
  }
  return false;
}

/** Stuck session 检测与告警 */
function checkStuckSessions(now: number): void {
  for (const record of state.sessions.values()) {
    const duration = now - record.lastActivityAt;

    if (duration >= STUCK_ABORT_MS) {
      // abort 告警，按 3x 倍数重发（避免刷屏的同时持续提醒）
      const shouldAnnounce =
        record.abortAnnouncedDuration === null ||
        duration >= record.abortAnnouncedDuration * STUCK_ABORT_MULTIPLIER;
      if (shouldAnnounce) {
        record.abortAnnouncedDuration =
          record.abortAnnouncedDuration === null
            ? STUCK_ABORT_MS
            : record.abortAnnouncedDuration * STUCK_ABORT_MULTIPLIER;
        logger.error(
          `[Diagnostic] 会话卡死(abort) key=${record.sessionKey} ` +
            `duration=${Math.round(duration / 1000)}s ` +
            `startedAt=${new Date(record.startedAt).toISOString()}`,
        );
      }
    } else if (duration >= STUCK_WARN_MS) {
      // warn 告警，每个会话仅发一次
      if (!record.warnAnnounced) {
        record.warnAnnounced = true;
        logger.warn(
          `[Diagnostic] 会话卡死(warn) key=${record.sessionKey} ` +
            `duration=${Math.round(duration / 1000)}s`,
        );
      }
    }
  }
}

/** 执行一次健康采样 */
function sampleHealth(): void {
  const now = Date.now();
  const eventLoopDelayMs = readAndResetEventLoopDelay();

  const currCpu = sampleCpus();
  const { cpuUsage, utilization } = state.prevCpu
    ? computeCpuDelta(state.prevCpu, currCpu)
    : { cpuUsage: 0, utilization: 0 };
  state.prevCpu = currCpu;

  const metrics = { eventLoopDelayMs, cpuUsage, utilization };
  const isAlive = checkLiveness(metrics, now);

  state.lastSnapshot = {
    eventLoopDelayMs,
    cpuUsage,
    utilization,
    isAlive,
    lastCheckAt: new Date(now).toISOString(),
  };

  checkStuckSessions(now);
}

/**
 * 启动 Event-Loop 健康监控（每 10s 采样一次）
 * 幂等：重复调用不会创建多个定时器
 */
export function startDiagnosticHealth(): void {
  if (state.timer) return;
  sampleHealth(); // 启动时立即采样一次
  const timer = setInterval(sampleHealth, SAMPLE_INTERVAL_MS);
  timer.unref(); // 不阻塞进程退出
  state.timer = timer;
  logger.info(`[Diagnostic] 健康监控已启动（间隔 ${SAMPLE_INTERVAL_MS / 1000}s）`);
}

/**
 * 停止健康监控并清理定时器
 */
export function stopDiagnosticHealth(): void {
  if (!state.timer) return;
  clearInterval(state.timer);
  state.timer = null;
  logger.info('[Diagnostic] 健康监控已停止');
}

/**
 * 获取当前健康快照
 */
export function getDiagnosticHealthSnapshot(): DiagnosticHealthSnapshot {
  return { ...state.lastSnapshot };
}

/**
 * 注册会话活动（创建或刷新会话记录）
 * 活动恢复时重置 warn/abort 告警标记，以便下次卡死重新告警
 */
export function registerSessionActivity(sessionKey: string): void {
  const now = Date.now();
  const existing = state.sessions.get(sessionKey);
  if (existing) {
    existing.lastActivityAt = now;
    existing.warnAnnounced = false;
    existing.abortAnnouncedDuration = null;
    return;
  }
  state.sessions.set(sessionKey, {
    sessionKey,
    startedAt: now,
    lastActivityAt: now,
    warnAnnounced: false,
    abortAnnouncedDuration: null,
  });
}

/**
 * 标记会话完成（移除会话记录）
 */
export function markSessionCompleted(sessionKey: string): void {
  state.sessions.delete(sessionKey);
}

/**
 * 获取当前卡死的会话列表
 * duration >= 120s 返回，severity 按 5min 阈值升级为 abort
 */
export function getStuckSessions(): StuckSessionInfo[] {
  const now = Date.now();
  const result: StuckSessionInfo[] = [];
  for (const record of state.sessions.values()) {
    const duration = now - record.lastActivityAt;
    if (duration < STUCK_WARN_MS) continue;
    result.push({
      sessionKey: record.sessionKey,
      startedAt: new Date(record.startedAt).toISOString(),
      lastActivityAt: new Date(record.lastActivityAt).toISOString(),
      durationMs: duration,
      severity: duration >= STUCK_ABORT_MS ? 'abort' : 'warn',
    });
  }
  return result;
}
