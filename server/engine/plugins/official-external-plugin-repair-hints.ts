/**
 * * Builds doctor/install repair hints for missing official external plugin owners.
 * 移植自 openclaw/src/plugins/official-external-plugin-repair-hints.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type OfficialExternalPluginRepairHint = unknown;

export function resolveOfficialExternalPluginRepairHint(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveOfficialExternalPluginRepairHint");
}

export function resolveMissingOfficialExternalChannelPluginRepairHint(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMissingOfficialExternalChannelPluginRepairHint");
}

