// 移植自 openclaw/src/infra/restart-coordinator.ts
// 降级：gateway 进程管理依赖简化

export type SafeGatewayRestartCounts = {
  restartCount: number;
  blockedCount: number;
};

export type SafeGatewayRestartBlocker = {
  kind: string;
  reason: string;
  remainingMs: number;
};

export type SafeGatewayRestartPreflight = {
  canRestart: boolean;
  blockers: SafeGatewayRestartBlocker[];
  counts: SafeGatewayRestartCounts;
};

export type SafeGatewayRestartRequestResult = {
  requested: boolean;
  preflight: SafeGatewayRestartPreflight;
};

/** Creates a restart preflight checker. Simplified without real gateway process management. */
export function createSafeGatewayRestartPreflight(_params?: {
  minRestartSpacingMs?: number;
  maxRestartsPerHour?: number;
}): SafeGatewayRestartPreflight {
  return { canRestart: true, blockers: [], counts: { restartCount: 0, blockedCount: 0 } };
}

/** Requests a safe gateway restart. Simplified without real gateway process management. */
export function requestSafeGatewayRestart(_params?: {
  reason?: string;
  force?: boolean;
}): SafeGatewayRestartRequestResult {
  const preflight = createSafeGatewayRestartPreflight();
  return { requested: preflight.canRestart, preflight };
}
