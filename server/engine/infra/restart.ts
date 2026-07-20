// 移植自 openclaw/src/infra/restart.ts

export type RestartAuditInfo = unknown;
export type GatewayRestartIntent = unknown;
export type RestartDeferralHooks = unknown;
export type RestartEmitHooks = unknown;
export type ScheduledRestart = unknown;
export type RestartAttempt = unknown;
export function resetGatewayRestartStateForInProcessRestart(...args: unknown[]): unknown {
  return undefined;
}
export function writeGatewayRestartIntentSync(...args: unknown[]): unknown {
  return undefined;
}
export function clearGatewayRestartIntentSync(...args: unknown[]): unknown {
  return undefined;
}
export function consumeGatewayRestartIntentPayloadSync(...args: unknown[]): unknown {
  return undefined;
}
export function consumeGatewayRestartIntentSync(...args: unknown[]): unknown {
  return undefined;
}
export function setPreRestartDeferralCheck(...args: unknown[]): unknown {
  return undefined;
}
export function emitGatewayRestart(...args: unknown[]): unknown {
  return undefined;
}
export function setGatewaySigusr1RestartPolicy(...args: unknown[]): unknown {
  return undefined;
}
export function isGatewaySigusr1RestartExternallyAllowed(...args: unknown[]): unknown {
  return false;
}
export function consumeGatewaySigusr1RestartAuthorization(...args: unknown[]): unknown {
  return undefined;
}
export function peekGatewaySigusr1RestartReason(...args: unknown[]): unknown {
  return undefined;
}
export function consumeGatewaySigusr1RestartIntent(...args: unknown[]): unknown {
  return undefined;
}
export function markGatewaySigusr1RestartHandled(...args: unknown[]): unknown {
  return undefined;
}
export function resolveGatewayRestartDeferralTimeoutMs(...args: unknown[]): unknown {
  return undefined;
}
export function deferGatewayRestartUntilIdle(...args: unknown[]): unknown {
  return undefined;
}
export function triggerOpenClawRestart(...args: unknown[]): unknown {
  return undefined;
}
export function scheduleGatewaySigusr1Restart(...args: unknown[]): unknown {
  return undefined;
}
export function scheduleGatewayRestart(...args: unknown[]): unknown {
  return undefined;
}
export const DEFAULT_RESTART_DEFERRAL_TIMEOUT_MS: unknown = undefined;
export const testing_restart: unknown = undefined;
export type findGatewayPidsOnPortSync = unknown;
export type __testing_restart = unknown;
