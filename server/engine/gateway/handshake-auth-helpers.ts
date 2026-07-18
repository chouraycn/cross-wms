// 移植自 openclaw/src/gateway/server/ws-connection/handshake-auth-helpers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const BROWSER_ORIGIN_LOOPBACK_RATE_LIMIT_IP: unknown = undefined;

export const BROWSER_ORIGIN_RATE_LIMIT_KEY_PREFIX: unknown = undefined;

export function resolveHandshakeBrowserSecurityContext(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveHandshakeBrowserSecurityContext");
}

export function shouldAllowSilentLocalPairing(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldAllowSilentLocalPairing");
}

export function resolvePairingLocality(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePairingLocality");
}

export function shouldSkipLocalBackendSelfPairing(...args: unknown[]): unknown {
  throw new Error("not implemented: shouldSkipLocalBackendSelfPairing");
}

export function resolveDeviceSignaturePayloadVersion(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveDeviceSignaturePayloadVersion");
}

export function resolveUnauthorizedHandshakeContext(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveUnauthorizedHandshakeContext");
}
