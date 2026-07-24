// === MIGRATED FROM OPENCLAW SOURCE (simplified) ===
// Source: openclaw/src/agents/auth-profiles/identity.ts (buildAuthProfileId 函数)
// Status: 已移植 openclaw 同源实现（简化版，依赖 @cdf-know/normalization-core）
// Used by: server/engine/plugins/provider-auth-helpers.ts
// 注：原 openclaw 实现依赖 normalizeOptionalString，本 stub 已通过
//      @cdf-know/normalization-core 同源包引用。

import { normalizeOptionalString } from "@cdf-know/normalization-core";

/**
 * Builds a provider-prefixed auth profile id.
 * Reference: openclaw/src/agents/auth-profiles/identity.ts (buildAuthProfileId)
 */
export function buildAuthProfileId(params: {
  providerId: string;
  profileName?: string | null;
  profilePrefix?: string;
}): string {
  const profilePrefix = normalizeOptionalString(params.profilePrefix) ?? params.providerId;
  const profileName = normalizeOptionalString(params.profileName) ?? "default";
  return `${profilePrefix}:${profileName}`;
}
