/**
 * Resolves npm project roots for plugin package inspection.
 * 移植自 openclaw/src/plugins/npm-project-roots.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function listManagedPluginNpmProjectRootsSync(...args: unknown[]): unknown {
  throw new Error("not implemented: listManagedPluginNpmProjectRootsSync");
}


export function listManagedPluginNpmRootsSync(...args: unknown[]): unknown {
  throw new Error("not implemented: listManagedPluginNpmRootsSync");
}


