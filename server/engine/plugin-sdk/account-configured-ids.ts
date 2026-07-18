/**
 * 已配置账号 ID 列举 — 从原始 channel account 记录 map 中列出规范化账号 id
 *
 * normalizeAccountId 由调用方注入，避免直接依赖具体实现。
 * cross-wms 中已有 server/engine/infra/account-id.ts 提供 normalizeAccountId。
 *
 * 参考 openclaw/src/plugin-sdk/account-configured-ids.ts
 */

/** 从原始 channel account 记录 map 列出规范化的已配置账号 id。 */
export function listConfiguredAccountIds(params: {
  accounts: Record<string, unknown> | undefined;
  normalizeAccountId: (accountId: string) => string;
}): string[] {
  if (!params.accounts) {
    return [];
  }
  const ids = new Set<string>();
  for (const key of Object.keys(params.accounts)) {
    if (!key) {
      continue;
    }
    ids.add(params.normalizeAccountId(key));
  }
  return [...ids];
}
