// 移植自 openclaw/src/gateway/server/ws-connection/handshake-auth-helpers.ts

export const BROWSER_ORIGIN_LOOPBACK_RATE_LIMIT_IP: any = undefined as any;

export const BROWSER_ORIGIN_RATE_LIMIT_KEY_PREFIX: any = undefined as any;

export function resolveHandshakeBrowserSecurityContext(...args: any[]): any {
  return undefined;
}

export function shouldAllowSilentLocalPairing(...args: any[]): any {
  return false;
}

export function resolvePairingLocality(...args: any[]): any {
  return undefined;
}

export function shouldSkipLocalBackendSelfPairing(...args: any[]): any {
  return false;
}

export function resolveDeviceSignaturePayloadVersion(...args: any[]): any {
  return undefined;
}

export function resolveUnauthorizedHandshakeContext(...args: any[]): any {
  return undefined;
}
