/**
 * Converts ClawHub plugin entries into install records.
 * 移植自 openclaw/src/plugins/clawhub-install-records.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type ClawHubPluginInstallRecordFields = unknown;

export function buildClawHubPluginInstallRecordFields(...args: unknown[]): unknown {
  throw new Error("not implemented: buildClawHubPluginInstallRecordFields");
}

