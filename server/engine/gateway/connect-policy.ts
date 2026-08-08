// 移植自 openclaw/src/gateway/server/ws-connection/connect-policy.ts

export function resolveControlUiAuthPolicy(...args: any[]): any {
  return undefined;
}

export function shouldSkipControlUiPairing(...args: any[]): any {
  return false;
}

export function isTrustedProxyControlUiOperatorAuth(...args: any[]): any {
  return false;
}

export function shouldClearUnboundScopesForMissingDeviceIdentity(...args: any[]): any {
  return false;
}

export function evaluateMissingDeviceIdentity(...args: any[]): any {
  return undefined;
}
