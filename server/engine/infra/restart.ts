// 移植自 openclaw/src/infra/restart.ts（降级实现）
// 网关重启协调主入口。
import type { RestartAttempt } from "./restart.types.js";
import { DEFAULT_RESTART_DEFERRAL_TIMEOUT_MS } from "./restart-coordinator.js";

export type { RestartAttempt };
export { DEFAULT_RESTART_DEFERRAL_TIMEOUT_MS } from "./restart-coordinator.js";
export type { RestartCoordinator, RestartCoordinatorOptions } from "./restart-coordinator.js";
export { createRestartCoordinator } from "./restart-coordinator.js";
export { findGatewayPidsOnPortSync } from "./restart-stale-pids.js";

export type GatewayRestartIntent = {
  reason?: string;
  sessionKey?: string;
  createdAtMs: number;
  ttlMs: number;
};

export type RestartEmitHooks = {
  onEmit?: (intent: GatewayRestartIntent) => void;
  onConsume?: (intent: GatewayRestartIntent) => void;
};

let pendingRestartTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRestartDueAt = 0;
let pendingRestartReason: string | undefined;
let pendingRestartSessionKey: string | undefined;
let pendingRestartSkipDeferral = false;

/**
 * 调度网关重启。
 * 降级实现：仅记录意图，不执行实际重启。
 */
export function scheduleGatewayRestart(params: {
  reason?: string;
  sessionKey?: string;
  skipDeferral?: boolean;
  deferralTimeoutMs?: number;
  hooks?: RestartEmitHooks;
}): void {
  const timeoutMs = params.deferralTimeoutMs ?? DEFAULT_RESTART_DEFERRAL_TIMEOUT_MS;
  pendingRestartReason = params.reason;
  pendingRestartSessionKey = params.sessionKey;
  pendingRestartSkipDeferral = params.skipDeferral ?? false;
  pendingRestartDueAt = Date.now() + timeoutMs;
  if (pendingRestartTimer) {
    clearTimeout(pendingRestartTimer);
  }
  pendingRestartTimer = setTimeout(() => {
    pendingRestartTimer = null;
  }, timeoutMs);
  const intent: GatewayRestartIntent = {
    reason: params.reason,
    sessionKey: params.sessionKey,
    createdAtMs: Date.now(),
    ttlMs: timeoutMs,
  };
  params.hooks?.onEmit?.(intent);
}

/** 取消待处理的重启 */
export function cancelPendingGatewayRestart(): void {
  if (pendingRestartTimer) {
    clearTimeout(pendingRestartTimer);
    pendingRestartTimer = null;
  }
  pendingRestartReason = undefined;
  pendingRestartSessionKey = undefined;
  pendingRestartSkipDeferral = false;
  pendingRestartDueAt = 0;
}

/** 检查是否有待处理的重启 */
export function isGatewayRestartPending(): boolean {
  return pendingRestartTimer !== null;
}

/** 获取待处理重启的原因 */
export function getPendingGatewayRestartReason(): string | undefined {
  return pendingRestartReason;
}

/** 获取待处理重启的到期时间 */
export function getPendingGatewayRestartDueAt(): number {
  return pendingRestartDueAt;
}

/**
 * 授权 SIGUSR1 重启信号。
 * 降级实现：noop。
 */
export function authorizeSigusr1Restart(_options?: { externalAllowed?: boolean; graceMs?: number }): void {
  // 降级：noop
}

/** 检查 SIGUSR1 是否已授权 */
export function isSigusr1Authorized(): boolean {
  return false;
}

/**
 * 执行网关重启。
 * 降级实现：返回失败。
 */
export async function restartGateway(_params?: {
  method?: "launchctl" | "systemd" | "schtasks" | "supervisor";
}): Promise<RestartAttempt> {
  return {
    ok: false,
    method: _params?.method ?? "supervisor",
    detail: "restartGateway stub: not implemented",
  };
}
