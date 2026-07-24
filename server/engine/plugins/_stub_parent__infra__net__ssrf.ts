// === MIGRATED STUB → REAL IMPLEMENTATION ===
// Source: openclaw/src/plugin-sdk/ssrf-policy.ts
// Status: 已迁移 — 真实实现在 server/engine/infra/net/ssrf-policy.ts
// Used by: server/engine/plugins/provider-self-hosted-setup.ts
// 注：SsrFPolicy 类型及 SSRF 防护策略已移植到 server/engine/infra/net/ssrf-policy.ts

export type { SsrFPolicy } from "../infra/net/ssrf-policy.js";
export {
  isAllowed,
  mergeSsrFPolicies,
  isPrivateIpAddress,
  isBlockedHostnameOrIp,
  ssrfPolicyFromPrivateNetworkOptIn,
  ssrfPolicyFromDangerouslyAllowPrivateNetwork,
  buildHostnameAllowlistPolicyFromSuffixAllowlist,
  normalizeHostnameSuffixAllowlist,
  isHttpsUrlAllowedByHostnameSuffixAllowlist,
  assertHttpUrlTargetsPrivateNetwork,
  createSsrfPolicyGuard,
} from "../infra/net/ssrf-policy.js";
