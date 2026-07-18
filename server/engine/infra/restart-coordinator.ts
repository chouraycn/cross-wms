// 移植自 openclaw/src/infra/restart-coordinator.ts（降级实现）
// 重启协调器。
import type { RestartAttempt } from "./restart.types.js";

export type { RestartAttempt };

export type RestartCoordinatorOptions = {
  cooldownMs?: number;
  deferralTimeoutMs?: number;
  deferralPollMs?: number;
};

export type RestartCoordinator = {
  scheduleRestart: (params: { reason?: string; skipDeferral?: boolean; sessionKey?: string }) => void;
  cancelRestart: () => void;
  isRestartPending: () => boolean;
  getPendingRestartReason: () => string | undefined;
};

export const DEFAULT_RESTART_DEFERRAL_TIMEOUT_MS = 300_000;
export const RESTART_COOLDOWN_MS = 30_000;

/**
 * 创建重启协调器。
 * 降级实现：不执行实际重启，仅记录状态。
 */
export function createRestartCoordinator(_options?: RestartCoordinatorOptions): RestartCoordinator {
  let pending = false;
  let pendingReason: string | undefined;
  return {
    scheduleRestart: (params) => {
      pending = true;
      pendingReason = params.reason;
    },
    cancelRestart: () => {
      pending = false;
      pendingReason = undefined;
    },
    isRestartPending: () => pending,
    getPendingRestartReason: () => pendingReason,
  };
}

/** 执行重启尝试（降级：返回失败） */
export async function performRestartAttempt(_params: {
  method?: "launchctl" | "systemd" | "schtasks" | "supervisor";
}): Promise<RestartAttempt> {
  return {
    ok: false,
    method: _params?.method ?? "supervisor",
    detail: "restart coordinator stub: not implemented",
  };
}
