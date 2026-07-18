/**
 * * Discovers plugin candidates from bundled, workspace, global, package, and bundle roots.
 * 移植自 openclaw/src/plugins/discovery.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginCandidate = unknown;

export type PluginDiscoveryResult = unknown;

export type CandidateBlockReason = unknown;

export function discoverOpenClawPlugins(...args: unknown[]): unknown {
  throw new Error("not implemented: discoverOpenClawPlugins");
}

