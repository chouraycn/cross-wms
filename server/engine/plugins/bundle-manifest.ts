/**
 * * Reads Codex/Claude/Cursor bundle manifests into OpenClaw plugin manifest metadata.
 * 移植自 openclaw/src/plugins/bundle-manifest.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export const CODEX_BUNDLE_MANIFEST_RELATIVE_PATH: unknown = undefined;

export const CLAUDE_BUNDLE_MANIFEST_RELATIVE_PATH: unknown = undefined;

export const CURSOR_BUNDLE_MANIFEST_RELATIVE_PATH: unknown = undefined;

export type BundlePluginManifest = unknown;

export type BundleManifestLoadResult = unknown;

export function normalizeBundlePathList(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeBundlePathList");
}

export function mergeBundlePathLists(...args: unknown[]): unknown {
  throw new Error("not implemented: mergeBundlePathLists");
}

export function loadBundleManifest(...args: unknown[]): unknown {
  throw new Error("not implemented: loadBundleManifest");
}

export function detectBundleManifestFormat(...args: unknown[]): unknown {
  throw new Error("not implemented: detectBundleManifestFormat");
}

