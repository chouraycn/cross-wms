/**
 * Tracks plugin loader provenance for diagnostics and policy checks.
 * 移植自 openclaw/src/plugins/loader-provenance.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginProvenanceIndex = unknown;

export function buildProvenanceIndex(...args: unknown[]): unknown {
  throw new Error("not implemented: buildProvenanceIndex");
}

export function compareDuplicateCandidateOrder(...args: unknown[]): unknown {
  throw new Error("not implemented: compareDuplicateCandidateOrder");
}

export function warnWhenAllowlistIsOpen(...args: unknown[]): unknown {
  throw new Error("not implemented: warnWhenAllowlistIsOpen");
}

export function warnAboutUntrackedLoadedPlugins(...args: unknown[]): unknown {
  throw new Error("not implemented: warnAboutUntrackedLoadedPlugins");
}

