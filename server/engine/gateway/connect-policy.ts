// 移植自 openclaw/src/gateway/server/ws-connection/connect-policy.ts

export function resolveControlUiAuthPolicy(...args: unknown[]): unknown {
  return undefined;
}

export function shouldSkipControlUiPairing(...args: unknown[]): unknown {
  return false;
}

export function isTrustedProxyControlUiOperatorAuth(...args: unknown[]): unknown {
  return false;
}

export function shouldClearUnboundScopesForMissingDeviceIdentity(...args: unknown[]): unknown {
  return false;
}

export function evaluateMissingDeviceIdentity(...args: unknown[]): unknown {
  return undefined;
}
