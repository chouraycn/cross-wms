// 移植自 openclaw/src/infra/restart.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type RestartAuditInfo = unknown;
export type GatewayRestartIntent = unknown;
export type RestartDeferralHooks = unknown;
export type RestartEmitHooks = unknown;
export type ScheduledRestart = unknown;
export type RestartAttempt = unknown;
export function resetGatewayRestartStateForInProcessRestart(...args: unknown[]): unknown {
  throw new Error("not implemented: resetGatewayRestartStateForInProcessRestart");
}
export function writeGatewayRestartIntentSync(...args: unknown[]): unknown {
  throw new Error("not implemented: writeGatewayRestartIntentSync");
}
export function clearGatewayRestartIntentSync(...args: unknown[]): unknown {
  throw new Error("not implemented: clearGatewayRestartIntentSync");
}
export function consumeGatewayRestartIntentPayloadSync(...args: unknown[]): unknown {
  throw new Error("not implemented: consumeGatewayRestartIntentPayloadSync");
}
export function consumeGatewayRestartIntentSync(...args: unknown[]): unknown {
  throw new Error("not implemented: consumeGatewayRestartIntentSync");
}
export function setPreRestartDeferralCheck(...args: unknown[]): unknown {
  throw new Error("not implemented: setPreRestartDeferralCheck");
}
export function emitGatewayRestart(...args: unknown[]): unknown {
  throw new Error("not implemented: emitGatewayRestart");
}
export function setGatewaySigusr1RestartPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: setGatewaySigusr1RestartPolicy");
}
export function isGatewaySigusr1RestartExternallyAllowed(...args: unknown[]): unknown {
  throw new Error("not implemented: isGatewaySigusr1RestartExternallyAllowed");
}
export function consumeGatewaySigusr1RestartAuthorization(...args: unknown[]): unknown {
  throw new Error("not implemented: consumeGatewaySigusr1RestartAuthorization");
}
export function peekGatewaySigusr1RestartReason(...args: unknown[]): unknown {
  throw new Error("not implemented: peekGatewaySigusr1RestartReason");
}
export function consumeGatewaySigusr1RestartIntent(...args: unknown[]): unknown {
  throw new Error("not implemented: consumeGatewaySigusr1RestartIntent");
}
export function markGatewaySigusr1RestartHandled(...args: unknown[]): unknown {
  throw new Error("not implemented: markGatewaySigusr1RestartHandled");
}
export function resolveGatewayRestartDeferralTimeoutMs(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveGatewayRestartDeferralTimeoutMs");
}
export function deferGatewayRestartUntilIdle(...args: unknown[]): unknown {
  throw new Error("not implemented: deferGatewayRestartUntilIdle");
}
export function triggerOpenClawRestart(...args: unknown[]): unknown {
  throw new Error("not implemented: triggerOpenClawRestart");
}
export function scheduleGatewaySigusr1Restart(...args: unknown[]): unknown {
  throw new Error("not implemented: scheduleGatewaySigusr1Restart");
}
export function scheduleGatewayRestart(...args: unknown[]): unknown {
  throw new Error("not implemented: scheduleGatewayRestart");
}
export const DEFAULT_RESTART_DEFERRAL_TIMEOUT_MS: unknown = undefined;
export const testing_restart: unknown = undefined;
export type findGatewayPidsOnPortSync = unknown;
export type __testing_restart = unknown;
