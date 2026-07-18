// 移植自 openclaw/src/config/plugin-install-config-migration.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function extractShippedPluginInstallConfigRecords(...args: unknown[]): unknown {
  throw new Error("not implemented: extractShippedPluginInstallConfigRecords");
}
export function stripShippedPluginInstallConfigRecords(...args: unknown[]): unknown {
  throw new Error("not implemented: stripShippedPluginInstallConfigRecords");
}
