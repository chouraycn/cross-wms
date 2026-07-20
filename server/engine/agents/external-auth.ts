/**
 * 移植自 openclaw/src/agents/auth-profiles/external-auth.ts
 *
 * 降级实现：提供外部认证配置，不再抛出 stub 错误。
 */

export function listRuntimeExternalAuthProfiles(_params?: unknown): unknown[] {
  return [];
}

export function overlayExternalAuthProfiles(params: { profiles: unknown[]; overlay?: unknown[] }): unknown[] {
  return params.overlay ?? params.profiles;
}

export async function syncPersistedExternalCliAuthProfiles(_params?: unknown): Promise<void> {
  // no-op in cross-wms降级实现
}

export const testing_external_auth: unknown = undefined;
