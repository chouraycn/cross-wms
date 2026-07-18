// 重新导出 gateway-client 握手超时辅助，让 server 代码与 client 包共享同一
// preauth/connect 超时边界。
// 移植自 openclaw/src/gateway/handshake-timeouts.ts。
// 依赖调整：../../packages/gateway-client/src/timeouts.js → 本地 _openclaw-stubs.ts
// （gateway-client 包未移植，stub 提供等价常量与降级解析）。
export {
  clampConnectChallengeTimeoutMs,
  DEFAULT_PREAUTH_HANDSHAKE_TIMEOUT_MS,
  getConnectChallengeTimeoutMsFromEnv,
  getPreauthHandshakeTimeoutMsFromEnv,
  MAX_CONNECT_CHALLENGE_TIMEOUT_MS,
  MIN_CONNECT_CHALLENGE_TIMEOUT_MS,
  resolveConnectChallengeTimeoutMs,
  resolvePreauthHandshakeTimeoutMs,
} from "./_openclaw-stubs.js";
