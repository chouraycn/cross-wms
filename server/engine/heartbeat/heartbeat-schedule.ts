/**
 * 心跳调度计算模块
 *
 * 计算确定性的心跳调度阶段和到期时间。
 */

import { createHash } from "node:crypto";

function resolvePositiveIntervalMs(value: number): number {
  return Math.max(1, Math.floor(value));
}

function normalizeModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

/** 根据调度种子和 agentId 计算心跳相位偏移 */
export function resolveHeartbeatPhaseMs(params: {
  schedulerSeed: string;
  agentId: string;
  intervalMs: number;
}) {
  const intervalMs = resolvePositiveIntervalMs(params.intervalMs);
  const digest = createHash("sha256").update(`${params.schedulerSeed}:${params.agentId}`).digest();
  return digest.readUInt32BE(0) % intervalMs;
}

/** 计算下一个心跳相位的到期时间 */
export function computeNextHeartbeatPhaseDueMs(params: {
  nowMs: number;
  intervalMs: number;
  phaseMs: number;
}) {
  const intervalMs = resolvePositiveIntervalMs(params.intervalMs);
  const nowMs = Number.isFinite(params.nowMs) ? Math.floor(params.nowMs) : 0;
  const phaseMs = normalizeModulo(
    Number.isFinite(params.phaseMs) ? Math.floor(params.phaseMs) : 0,
    intervalMs,
  );
  const cyclePositionMs = normalizeModulo(nowMs, intervalMs);
  let deltaMs = normalizeModulo(phaseMs - cyclePositionMs, intervalMs);
  if (deltaMs === 0) {
    deltaMs = intervalMs;
  }
  return nowMs + deltaMs;
}

/** 解析下一次心跳的到期时间 */
export function resolveNextHeartbeatDueMs(params: {
  nowMs: number;
  intervalMs: number;
  phaseMs: number;
  prev?: {
    intervalMs: number;
    phaseMs: number;
    nextDueMs: number;
  };
}) {
  const intervalMs = resolvePositiveIntervalMs(params.intervalMs);
  const phaseMs = normalizeModulo(
    Number.isFinite(params.phaseMs) ? Math.floor(params.phaseMs) : 0,
    intervalMs,
  );
  const prev = params.prev;
  if (
    prev &&
    prev.intervalMs === intervalMs &&
    prev.phaseMs === phaseMs &&
    prev.nextDueMs > params.nowMs
  ) {
    return prev.nextDueMs;
  }
  return computeNextHeartbeatPhaseDueMs({
    nowMs: params.nowMs,
    intervalMs,
    phaseMs,
  });
}

/**
 * 在活动时间窗口内查找下一个相位对齐的时间点。
 * 当没有提供谓词或在查找范围内找不到窗口内的时间点时，回退到原始的下一个时间点。
 */
const MAX_SEEK_HORIZON_MS = 7 * 24 * 60 * 60_000;
const MAX_SEEK_ITERATIONS = 10_080;

export function seekNextActivePhaseDueMs(params: {
  startMs: number;
  intervalMs: number;
  phaseMs: number;
  isActive?: (ms: number) => boolean;
}): number {
  const isActive = params.isActive;
  if (!isActive) {
    return params.startMs;
  }
  const intervalMs = resolvePositiveIntervalMs(params.intervalMs);
  const horizonMs = params.startMs + MAX_SEEK_HORIZON_MS;
  let candidateMs = params.startMs;
  let iterations = 0;
  while (candidateMs <= horizonMs && iterations < MAX_SEEK_ITERATIONS) {
    if (isActive(candidateMs)) {
      return candidateMs;
    }
    candidateMs += intervalMs;
    iterations++;
  }
  return params.startMs;
}