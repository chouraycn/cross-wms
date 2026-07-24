// 移植自 openclaw/src/gateway/server/ws-connection/handshake-auth-helpers.ts

export const BROWSER_ORIGIN_LOOPBACK_RATE_LIMIT_IP: unknown = undefined as unknown;

export const BROWSER_ORIGIN_RATE_LIMIT_KEY_PREFIX: unknown = undefined as unknown;

export function resolveHandshakeBrowserSecurityContext(...args: unknown[]): unknown {
  return undefined;
}

export function shouldAllowSilentLocalPairing(...args: unknown[]): unknown {
  return false;
}

export function resolvePairingLocality(...args: unknown[]): unknown {
  return undefined;
}

export function shouldSkipLocalBackendSelfPairing(...args: unknown[]): unknown {
  return false;
}

export function resolveDeviceSignaturePayloadVersion(...args: unknown[]): unknown {
  return undefined;
}

export function resolveUnauthorizedHandshakeContext(...args: unknown[]): unknown {
  return undefined;
}
