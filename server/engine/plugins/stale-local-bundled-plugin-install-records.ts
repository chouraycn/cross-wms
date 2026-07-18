/**
 * Detects stale local bundled plugin install records.
 * 移植自 openclaw/src/plugins/stale-local-bundled-plugin-install-records.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type StaleLocalBundledPluginInstallRecord = unknown;

export function listStaleLocalBundledPluginInstallRecords(...args: unknown[]): unknown {
  throw new Error("not implemented: listStaleLocalBundledPluginInstallRecords");
}

export function pruneStaleLocalBundledPluginInstallRecords(...args: unknown[]): unknown {
  throw new Error("not implemented: pruneStaleLocalBundledPluginInstallRecords");
}

