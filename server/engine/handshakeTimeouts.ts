/**
 * 握手超时 — 参考 OpenClaw gateway/handshake-timeouts.ts
 *
 * 网关客户端握手超时辅助工具，确保服务器和客户端共享相同的超时边界。
 */

export const DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS = 30_000;
export const MIN_CONNECT_CHALLENGE_TIMEOUT_MS = 5_000;
export const MAX_CONNECT_CHALLENGE_TIMEOUT_MS = 300_000;

export function getPreauthHandshakeTimeoutMsFromEnv(): number | undefined {
  const envValue = process.env.OPENCLAW_PREAUTH_HANDSHAKE_TIMEOUT_MS;
  if (!envValue) return undefined;

  const parsed = parseInt(envValue, 10);
  if (Number.isNaN(parsed)) return undefined;

  return parsed;
}

export function getConnectChallengeTimeoutMsFromEnv(): number | undefined {
  const envValue = process.env.OPENCLAW_CONNECT_CHALLENGE_TIMEOUT_MS;
  if (!envValue) return undefined;

  const parsed = parseInt(envValue, 10);
  if (Number.isNaN(parsed)) return undefined;

  return parsed;
}

export function clampConnectChallengeTimeoutMs(value: number): number {
  return Math.max(MIN_CONNECT_CHALLENGE_TIMEOUT_MS, Math.min(value, MAX_CONNECT_CHALLENGE_TIMEOUT_MS));
}

export function resolvePreauthHandshakeTimeoutMs(): number {
  const envValue = getPreauthHandshakeTimeoutMsFromEnv();
  return envValue ?? DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS;
}

export function resolveConnectChallengeTimeoutMs(): number {
  const envValue = getConnectChallengeTimeoutMsFromEnv();
  const resolved = envValue ?? DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS;
  return clampConnectChallengeTimeoutMs(resolved);
}