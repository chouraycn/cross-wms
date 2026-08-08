// 移植自 openclaw/src/infra/restart.ts

export type RestartAuditInfo = unknown;
export type GatewayRestartIntent = unknown;
export type RestartDeferralHooks = unknown;
export type RestartEmitHooks = unknown;
export type ScheduledRestart = unknown;
export type RestartAttempt = unknown;
export function resetGatewayRestartStateForInProcessRestart(...args: any[]): any {
  return undefined;
}
export function writeGatewayRestartIntentSync(...args: any[]): any {
  return undefined;
}
export function clearGatewayRestartIntentSync(...args: any[]): any {
  return undefined;
}
export function consumeGatewayRestartIntentPayloadSync(...args: any[]): any {
  return undefined;
}
export function consumeGatewayRestartIntentSync(...args: any[]): any {
  return undefined;
}
export function setPreRestartDeferralCheck(...args: any[]): any {
  return undefined;
}
export function emitGatewayRestart(...args: any[]): any {
  return undefined;
}
export function setGatewaySigusr1RestartPolicy(...args: any[]): any {
  return undefined;
}
export function isGatewaySigusr1RestartExternallyAllowed(...args: any[]): any {
  return false;
}
export function consumeGatewaySigusr1RestartAuthorization(...args: any[]): any {
  return undefined;
}
export function peekGatewaySigusr1RestartReason(...args: any[]): any {
  return undefined;
}
export function consumeGatewaySigusr1RestartIntent(...args: any[]): any {
  return undefined;
}
export function markGatewaySigusr1RestartHandled(...args: any[]): any {
  return undefined;
}
export function resolveGatewayRestartDeferralTimeoutMs(...args: any[]): any {
  return undefined;
}
export function deferGatewayRestartUntilIdle(...args: any[]): any {
  return undefined;
}
export function triggerOpenClawRestart(...args: any[]): any {
  return undefined;
}
export function scheduleGatewaySigusr1Restart(...args: any[]): any {
  return undefined;
}
export function scheduleGatewayRestart(...args: any[]): any {
  return undefined;
}
export const DEFAULT_RESTART_DEFERRAL_TIMEOUT_MS: any = undefined as any;
export const testing_restart: any = undefined as any;
export type findGatewayPidsOnPortSync = unknown;
export type __testing_restart = unknown;
