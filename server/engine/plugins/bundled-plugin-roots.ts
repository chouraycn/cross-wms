// 移植自 openclaw/src/plugins/bundled-plugin-roots.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function getBundledPluginRoots(...args: unknown[]): unknown {
  throw new Error("not implemented: getBundledPluginRoots");
}
export function resolveBundledPluginFile(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveBundledPluginFile");
}
export function bundledPluginFile(...args: unknown[]): unknown {
  throw new Error("not implemented: bundledPluginFile");
}
