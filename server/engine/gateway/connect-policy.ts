// 移植自 openclaw/src/gateway/server/ws-connection/connect-policy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveControlUiAuthPolicy(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveControlUiAuthPolicy");
}

export function shouldSkipControlUiPairing(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldSkipControlUiPairing");
}

export function isTrustedProxyControlUiOperatorAuth(...args: unknown[]): unknown {
  throw new Error("not implemented: isTrustedProxyControlUiOperatorAuth");
}

export function shouldClearUnboundScopesForMissingDeviceIdentity(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldClearUnboundScopesForMissingDeviceIdentity");
}

export function evaluateMissingDeviceIdentity(...args: unknown[]): unknown {
  throw new Error("not implemented: evaluateMissingDeviceIdentity");
}
