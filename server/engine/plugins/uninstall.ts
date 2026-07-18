/**
 * Removes installed plugins and updates plugin index records.
 * 移植自 openclaw/src/plugins/uninstall.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type UninstallActions = unknown;

export const UNINSTALL_ACTION_LABELS: unknown = undefined;

export function createEmptyUninstallActions(...args: unknown[]): unknown {
  throw new Error("not implemented: createEmptyUninstallActions");
}

export function formatUninstallActionLabels(...args: unknown[]): unknown {
  throw new Error("not implemented: formatUninstallActionLabels");
}

export function formatUninstallSlotResetPreview(...args: unknown[]): unknown {
  throw new Error("not implemented: formatUninstallSlotResetPreview");
}

export type UninstallPluginResult = unknown;

export type PluginUninstallDirectoryRemoval = unknown;

export type PluginUninstallPlanResult = unknown;

export function resolveUninstallDirectoryTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveUninstallDirectoryTarget");
}

export function resolveUninstallChannelConfigKeys(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveUninstallChannelConfigKeys");
}

export function removePluginFromConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: removePluginFromConfig");
}

export type UninstallPluginParams = unknown;

export function planPluginUninstall(...args: unknown[]): unknown {
  throw new Error("not implemented: planPluginUninstall");
}



