// 移植自 openclaw/src/infra/push-apns.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ApnsRegistration = unknown;
export type ApnsAuthConfig = unknown;
export type ApnsPushResult = unknown;
export function normalizeApnsEnvironment(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeApnsEnvironment");
}
export function registerApnsRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: registerApnsRegistration");
}
export function loadApnsRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: loadApnsRegistration");
}
export function loadApnsRegistrations(...args: unknown[]): unknown {
  throw new Error("not implemented: loadApnsRegistrations");
}
export function clearApnsRegistrationIfCurrent(...args: unknown[]): unknown {
  throw new Error("not implemented: clearApnsRegistrationIfCurrent");
}
export function shouldInvalidateApnsRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldInvalidateApnsRegistration");
}
export function shouldClearStoredApnsRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldClearStoredApnsRegistration");
}
export function resolveApnsAuthConfigFromEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApnsAuthConfigFromEnv");
}
export function sendApnsAlert(...args: unknown[]): unknown {
  throw new Error("not implemented: sendApnsAlert");
}
export function sendApnsBackgroundWake(...args: unknown[]): unknown {
  throw new Error("not implemented: sendApnsBackgroundWake");
}
export function sendApnsExecApprovalAlert(...args: unknown[]): unknown {
  throw new Error("not implemented: sendApnsExecApprovalAlert");
}
export function sendApnsExecApprovalResolvedWake(...args: unknown[]): unknown {
  throw new Error("not implemented: sendApnsExecApprovalResolvedWake");
}
export type ApnsRelayConfig = unknown;
export type resolveApnsRelayConfigFromEnv = unknown;
