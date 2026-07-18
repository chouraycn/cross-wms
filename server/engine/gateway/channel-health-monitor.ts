// Gateway channel health monitor.
// Periodically evaluates channel account health and restarts stale runtimes.
//
// 降级说明：
//  - `../channels/plugins/types.public.js` 的 ChannelId 降级为本地 string 别名。
//  - `../logging/subsystem.js` 的 createSubsystemLogger 降级为基于 console 的
//    最小实现（保留 info/warn/error 可选方法签名）。
//  - `../shared/number-coercion.js` 的 resolveTimerTimeoutMs 内联降级实现。
//  - `./server-channels.js` 的 ChannelManager 降级为本地宽松占位接口。
import {
  DEFAULT_CHANNEL_CONNECT_GRACE_MS,
  DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS,
  evaluateChannelHealth,
  resolveChannelRestartReason,
  type ChannelHealthPolicy,
} from "./channel-health-policy.js";

// ============================================================================
// 降级类型与工具
// ============================================================================

/** Channel id（降级占位）。 */
type ChannelId = string;

/**
 * 子系统日志记录器（降级占位）。
 *
 * 降级原因：openclaw `logging/subsystem` 依赖完整的日志子系统与级别过滤。
 * 这里提供与原接口兼容的最小 console 实现。
 */
type SubsystemLogger = {
  info?: (message: string) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
};

function createSubsystemLogger(_subsystem: string): SubsystemLogger {
  return {
    info: (message: string) => {
      // 降级实现：仅写入 stdout，不附加子系统前缀
      // eslint-disable-next-line no-console
      console.log(message);
    },
    warn: (message: string) => {
      // eslint-disable-next-line no-console
      console.warn(message);
    },
    error: (message: string) => {
      // eslint-disable-next-line no-console
      console.error(message);
    },
  };
}

/**
 * 解析 timer 超时，至少为 minMs（降级实现）。
 *
 * 降级原因：openclaw `shared/number-coercion.js` 的 resolveTimerTimeoutMs
 * 还会从 env 读取上限。这里仅保证下限。
 */
function resolveTimerTimeoutMs(timeoutMs: number | undefined, minMs: number): number {
  if (timeoutMs === undefined || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return minMs;
  }
  return Math.max(minMs, Math.floor(timeoutMs));
}

/**
 * Channel manager 宽松占位接口（降级）。
 *
 * 降级原因：openclaw `./server-channels.js` 的 ChannelManager 依赖完整的
 * channel 插件运行时、连接状态与重启策略。这里仅描述健康监控所需的方法契约。
 */
export type ChannelManager = {
  getRuntimeSnapshot(): {
    channelAccounts: Record<string, Record<string, ChannelRuntimeStatus> | undefined>;
  };
  isHealthMonitorEnabled(channelId: ChannelId, accountId: string): boolean;
  isManuallyStopped(channelId: ChannelId, accountId: string): boolean;
  stopChannel(
    channelId: ChannelId,
    accountId: string,
    options?: { manual?: boolean },
  ): Promise<void>;
  resetRestartAttempts(channelId: ChannelId, accountId: string): void;
  startChannel(channelId: ChannelId, accountId: string): Promise<void>;
};

/** Channel 运行时状态（降级宽松占位，与 channel-health-policy 的 ChannelHealthSnapshot 兼容）。 */
export type ChannelRuntimeStatus = {
  running?: boolean;
  connected?: boolean;
  enabled?: boolean;
  configured?: boolean;
  restartPending?: boolean;
  busy?: boolean;
  activeRuns?: number;
  lastRunActivityAt?: number | null;
  lastEventAt?: number | null;
  lastConnectedAt?: number | null;
  lastTransportActivityAt?: number | null;
  lastStartAt?: number | null;
  reconnectAttempts?: number;
  mode?: string;
  [key: string]: unknown;
};

// ============================================================================
// 主实现
// ============================================================================

const log = createSubsystemLogger("gateway/health-monitor");

const DEFAULT_CHECK_INTERVAL_MS = 5 * 60_000;
const DEFAULT_MONITOR_STARTUP_GRACE_MS = 60_000;
const DEFAULT_COOLDOWN_CYCLES = 2;
const DEFAULT_MAX_RESTARTS_PER_HOUR = 10;
const ONE_HOUR_MS = 60 * 60_000;

/**
 * How long a connected channel can go without proven transport activity before
 * the health monitor treats it as a "stale socket" and triggers a restart.
 * Providers should only publish that timestamp from transport/heartbeat/poll
 * signals, not from ordinary app messages.
 */
type ChannelHealthTimingPolicy = {
  monitorStartupGraceMs: number;
  channelConnectGraceMs: number;
  staleEventThresholdMs: number;
};

type ChannelHealthMonitorDeps = {
  channelManager: ChannelManager;
  checkIntervalMs?: number;
  /** @deprecated use timing.monitorStartupGraceMs */
  startupGraceMs?: number;
  /** @deprecated use timing.channelConnectGraceMs */
  channelStartupGraceMs?: number;
  /** @deprecated use timing.staleEventThresholdMs */
  staleEventThresholdMs?: number;
  timing?: Partial<ChannelHealthTimingPolicy>;
  cooldownCycles?: number;
  maxRestartsPerHour?: number;
  abortSignal?: AbortSignal;
};

export type ChannelHealthMonitor = {
  stop: () => void;
};

type RestartRecord = {
  lastRestartAt: number;
  restartsThisHour: { at: number }[];
};

function resolveTimingPolicy(
  deps: Pick<
    ChannelHealthMonitorDeps,
    "startupGraceMs" | "channelStartupGraceMs" | "staleEventThresholdMs" | "timing"
  >,
): ChannelHealthTimingPolicy {
  return {
    monitorStartupGraceMs:
      deps.timing?.monitorStartupGraceMs ?? deps.startupGraceMs ?? DEFAULT_MONITOR_STARTUP_GRACE_MS,
    channelConnectGraceMs:
      deps.timing?.channelConnectGraceMs ??
      deps.channelStartupGraceMs ??
      DEFAULT_CHANNEL_CONNECT_GRACE_MS,
    staleEventThresholdMs:
      deps.timing?.staleEventThresholdMs ??
      deps.staleEventThresholdMs ??
      DEFAULT_CHANNEL_STALE_EVENT_THRESHOLD_MS,
  };
}

/** Start the periodic channel health monitor and return its stop handle. */
export function startChannelHealthMonitor(deps: ChannelHealthMonitorDeps): ChannelHealthMonitor {
  const {
    channelManager,
    cooldownCycles = DEFAULT_COOLDOWN_CYCLES,
    maxRestartsPerHour = DEFAULT_MAX_RESTARTS_PER_HOUR,
    abortSignal,
  } = deps;
  const checkIntervalMs = resolveTimerTimeoutMs(deps.checkIntervalMs, DEFAULT_CHECK_INTERVAL_MS);
  const timing = resolveTimingPolicy(deps);

  const cooldownMs = cooldownCycles * checkIntervalMs;
  const restartRecords = new Map<string, RestartRecord>();
  const startedAt = Date.now();
  let stopped = false;
  let checkInFlight = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const rKey = (channelId: string, accountId: string) => `${channelId}:${accountId}`;

  function pruneOldRestarts(record: RestartRecord, now: number) {
    record.restartsThisHour = record.restartsThisHour.filter((r) => now - r.at < ONE_HOUR_MS);
  }

  async function runCheck() {
    if (stopped || checkInFlight) {
      return;
    }
    checkInFlight = true;

    try {
      const now = Date.now();
      if (now - startedAt < timing.monitorStartupGraceMs) {
        return;
      }

      const snapshot = channelManager.getRuntimeSnapshot();

      for (const [channelId, accounts] of Object.entries(snapshot.channelAccounts)) {
        if (!accounts) {
          continue;
        }
        for (const [accountId, status] of Object.entries(accounts)) {
          if (!status) {
            continue;
          }
          if (!channelManager.isHealthMonitorEnabled(channelId as ChannelId, accountId)) {
            continue;
          }
          if (channelManager.isManuallyStopped(channelId as ChannelId, accountId)) {
            continue;
          }
          const healthPolicy: ChannelHealthPolicy = {
            channelId,
            now,
            staleEventThresholdMs: timing.staleEventThresholdMs,
            channelConnectGraceMs: timing.channelConnectGraceMs,
          };
          const health = evaluateChannelHealth(status, healthPolicy);
          if (health.healthy) {
            continue;
          }

          const key = rKey(channelId, accountId);
          const record = restartRecords.get(key) ?? {
            lastRestartAt: 0,
            restartsThisHour: [],
          };

          if (now - record.lastRestartAt <= cooldownMs) {
            continue;
          }

          pruneOldRestarts(record, now);
          if (record.restartsThisHour.length >= maxRestartsPerHour) {
            log.warn?.(
              `[${channelId}:${accountId}] health-monitor: hit ${maxRestartsPerHour} restarts/hour limit, skipping`,
            );
            continue;
          }

          const reason = resolveChannelRestartReason(status, health);

          log.info?.(`[${channelId}:${accountId}] health-monitor: restarting (reason: ${reason})`);

          record.lastRestartAt = now;
          record.restartsThisHour.push({ at: now });
          restartRecords.set(key, record);

          try {
            if (status.running) {
              await channelManager.stopChannel(channelId as ChannelId, accountId, {
                manual: false,
              });
            }
            channelManager.resetRestartAttempts(channelId as ChannelId, accountId);
            await channelManager.startChannel(channelId as ChannelId, accountId);
          } catch (err) {
            log.error?.(
              `[${channelId}:${accountId}] health-monitor: restart failed: ${String(err)}`,
            );
          }
        }
      }
    } catch (err) {
      log.error?.(`health-monitor: check failed: ${String(err)}`);
    } finally {
      checkInFlight = false;
    }
  }

  function stop() {
    stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    abortSignal?.removeEventListener("abort", stop);
  }

  if (abortSignal?.aborted) {
    stopped = true;
  } else {
    abortSignal?.addEventListener("abort", stop, { once: true });
    timer = setInterval(() => void runCheck(), checkIntervalMs);
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }
    log.info?.(
      `started (interval: ${Math.round(checkIntervalMs / 1000)}s, startup-grace: ${Math.round(timing.monitorStartupGraceMs / 1000)}s, channel-connect-grace: ${Math.round(timing.channelConnectGraceMs / 1000)}s)`,
    );
  }

  return { stop };
}
