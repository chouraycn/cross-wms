/**
 * Bundles MCP metadata exposed by plugins for package output.
 * 移植自 openclaw/src/plugins/bundle-mcp.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type BundleMcpServerConfig = unknown;

export type BundleMcpConfig = unknown;

export type BundleMcpDiagnostic = unknown;

export type EnabledBundleMcpConfigResult = unknown;

export type BundleMcpRuntimeSupport = unknown;

export function extractMcpServerMap(...args: unknown[]): unknown {
  throw new Error("not implemented: extractMcpServerMap");
}

export function inspectBundleMcpRuntimeSupport(...args: unknown[]): unknown {
  throw new Error("not implemented: inspectBundleMcpRuntimeSupport");
}

export function loadEnabledBundleMcpConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: loadEnabledBundleMcpConfig");
}

