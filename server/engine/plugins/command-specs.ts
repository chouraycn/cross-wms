/**
 * Normalizes plugin command specs for CLI and slash command surfaces.
 * 移植自 openclaw/src/plugins/command-specs.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginCommandEntrySpec = unknown;

export function getPluginCommandSpecs(...args: unknown[]): unknown {
  throw new Error("not implemented: getPluginCommandSpecs");
}

export function getPluginCommandEntrySpecs(...args: unknown[]): unknown {
  throw new Error("not implemented: getPluginCommandEntrySpecs");
}

export function getPluginCommandEntrySpecsFromRegistrations(...args: unknown[]): unknown {
  throw new Error("not implemented: getPluginCommandEntrySpecsFromRegistrations");
}

export function listProviderPluginCommandSpecs(...args: unknown[]): unknown {
  throw new Error("not implemented: listProviderPluginCommandSpecs");
}

