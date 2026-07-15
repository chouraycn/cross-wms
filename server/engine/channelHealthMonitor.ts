/**
 * 通道健康监控 — 参考 OpenClaw gateway/channel-health-monitor.ts
 *
 * 定期评估通道账户健康状况并重启过期运行时。
 */

import { logger } from '../logger.js';
import { publishEvent } from './events.js';

export type ChannelStatus = 'healthy' | 'degraded' | 'stale' | 'disconnected';

export interface ChannelHealthInfo {
  channelId: string;
  channelName: string;
  status: ChannelStatus;
  lastEventAt: number;
  connectedAt: number;
  restartCount: number;
  lastRestartAt?: number;
}

export interface ChannelHealthMonitorDeps {
  checkIntervalMs?: number;
  startupGraceMs?: number;
  staleEventThresholdMs?: number;
  cooldownCycles?: number;
  maxRestartsPerHour?: number;
}

export interface ChannelHealthMonitor {
  stop: () => void;
  forceCheck: () => Promise<void>;
}

const DEFAULT_CHECK_INTERVAL_MS = 5 * 60_000;
const DEFAULT_STARTUP_GRACE_MS = 60_000;
const DEFAULT_STALE_EVENT_THRESHOLD_MS = 10 * 60_000;
const DEFAULT_COOLDOWN_CYCLES = 2;
const DEFAULT_MAX_RESTARTS_PER_HOUR = 10;
const ONE_HOUR_MS = 60 * 60_000;

interface RestartRecord {
  lastRestartAt: number;
  restartsThisHour: number[];
}

interface ChannelEntry {
  info: ChannelHealthInfo;
  staleCycleCount: number;
}

const channels = new Map<string, ChannelEntry>();
const restartRecords = new Map<string, RestartRecord>();
let monitorTimer: ReturnType<typeof setInterval> | undefined;
let monitorStarted = false;

export function registerChannel(channelId: string, channelName: string): void {
  channels.set(channelId, {
    info: {
      channelId,
      channelName,
      status: 'healthy',
      lastEventAt: Date.now(),
      connectedAt: Date.now(),
      restartCount: 0,
    },
    staleCycleCount: 0,
  });

  logger.info(`[ChannelHealthMonitor] 注册通道: ${channelId} (${channelName})`);
}

export function unregisterChannel(channelId: string): void {
  channels.delete(channelId);
  restartRecords.delete(channelId);
  logger.debug(`[ChannelHealthMonitor] 注销通道: ${channelId}`);
}

export function recordChannelEvent(channelId: string): void {
  const entry = channels.get(channelId);
  if (!entry) return;

  entry.info.lastEventAt = Date.now();
  entry.info.status = 'healthy';
  entry.staleCycleCount = 0;
}

export function getChannelHealth(channelId: string): ChannelHealthInfo | undefined {
  return channels.get(channelId)?.info;
}

export function listChannelHealth(): ChannelHealthInfo[] {
  return Array.from(channels.values()).map((e) => e.info);
}

function evaluateChannelHealth(
  entry: ChannelEntry,
  now: number,
  staleThresholdMs: number,
): ChannelStatus {
  if (now - entry.info.connectedAt < DEFAULT_STARTUP_GRACE_MS) {
    return 'healthy';
  }

  const timeSinceLastEvent = now - entry.info.lastEventAt;

  if (timeSinceLastEvent > staleThresholdMs) {
    return 'stale';
  }

  if (timeSinceLastEvent > staleThresholdMs / 2) {
    return 'degraded';
  }

  return 'healthy';
}

function canRestart(channelId: string, now: number, maxRestartsPerHour: number): boolean {
  const record = restartRecords.get(channelId);

  if (!record) {
    return true;
  }

  record.restartsThisHour = record.restartsThisHour.filter(
    (t) => now - t < ONE_HOUR_MS,
  );

  return record.restartsThisHour.length < maxRestartsPerHour;
}

function recordRestart(channelId: string, now: number): void {
  let record = restartRecords.get(channelId);
  if (!record) {
    record = { lastRestartAt: now, restartsThisHour: [] };
    restartRecords.set(channelId, record);
  }

  record.lastRestartAt = now;
  record.restartsThisHour.push(now);
}

async function performHealthCheck(
  staleThresholdMs: number,
  cooldownCycles: number,
  maxRestartsPerHour: number,
): Promise<void> {
  const now = Date.now();

  for (const [channelId, entry] of channels) {
    const status = evaluateChannelHealth(entry, now, staleThresholdMs);
    const oldStatus = entry.info.status;

    if (status !== oldStatus) {
      entry.info.status = status;

      await publishEvent('system:error', {
        channelId,
        channelName: entry.info.channelName,
        oldStatus,
        newStatus: status,
      }, {
        level: 'warning',
        message: `通道状态变化: ${entry.info.channelName} ${oldStatus} → ${status}`,
      });

      logger.warn(`[ChannelHealthMonitor] 通道 ${channelId} 状态变化: ${oldStatus} → ${status}`);
    }

    if (status === 'stale') {
      entry.staleCycleCount++;

      if (entry.staleCycleCount >= cooldownCycles) {
        if (canRestart(channelId, now, maxRestartsPerHour)) {
          logger.warn(`[ChannelHealthMonitor] 通道 ${channelId} 连续 ${entry.staleCycleCount} 次过期，触发重启`);

          entry.info.restartCount++;
          entry.info.lastRestartAt = now;
          entry.staleCycleCount = 0;
          recordRestart(channelId, now);
        } else {
          logger.warn(`[ChannelHealthMonitor] 通道 ${channelId} 重启次数已达上限 (${maxRestartsPerHour}/小时)`);
        }
      }
    } else {
      entry.staleCycleCount = 0;
    }
  }
}

export function startChannelHealthMonitor(deps: ChannelHealthMonitorDeps = {}): ChannelHealthMonitor {
  if (monitorStarted) {
    logger.warn('[ChannelHealthMonitor] 监控已在运行');
    return { stop: stopChannelHealthMonitor, forceCheck: async () => {} };
  }

  const checkIntervalMs = deps.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
  const staleThresholdMs = deps.staleEventThresholdMs ?? DEFAULT_STALE_EVENT_THRESHOLD_MS;
  const cooldownCycles = deps.cooldownCycles ?? DEFAULT_COOLDOWN_CYCLES;
  const maxRestartsPerHour = deps.maxRestartsPerHour ?? DEFAULT_MAX_RESTARTS_PER_HOUR;

  monitorStarted = true;

  monitorTimer = setInterval(() => {
    performHealthCheck(staleThresholdMs, cooldownCycles, maxRestartsPerHour).catch((err) => {
      logger.error('[ChannelHealthMonitor] 健康检查失败', err);
    });
  }, checkIntervalMs);

  const unref = (monitorTimer as { unref?: () => void }).unref;
  if (typeof unref === 'function') {
    unref.call(monitorTimer);
  }

  logger.info(`[ChannelHealthMonitor] 启动通道健康监控 (间隔 ${checkIntervalMs}ms)`);

  return {
    stop: stopChannelHealthMonitor,
    forceCheck: async () => {
      await performHealthCheck(staleThresholdMs, cooldownCycles, maxRestartsPerHour);
    },
  };
}

export function stopChannelHealthMonitor(): void {
  if (!monitorStarted) return;

  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = undefined;
  }

  monitorStarted = false;
  logger.info('[ChannelHealthMonitor] 通道健康监控已停止');
}

export function getMonitorStats(): {
  channelCount: number;
  healthy: number;
  degraded: number;
  stale: number;
  disconnected: number;
  totalRestarts: number;
} {
  let healthy = 0;
  let degraded = 0;
  let stale = 0;
  let disconnected = 0;
  let totalRestarts = 0;

  for (const entry of channels.values()) {
    switch (entry.info.status) {
      case 'healthy':
        healthy++;
        break;
      case 'degraded':
        degraded++;
        break;
      case 'stale':
        stale++;
        break;
      case 'disconnected':
        disconnected++;
        break;
    }
    totalRestarts += entry.info.restartCount;
  }

  return {
    channelCount: channels.size,
    healthy,
    degraded,
    stale,
    disconnected,
    totalRestarts,
  };
}