/**
 * * Loads plugin CLI registrations lazily for the command tree and plugin-owned subcommands.
 * 移植自 openclaw/src/plugins/cli-registry-loader.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginCliLoaderOptions = unknown;

export type PluginCliPublicLoadParams = unknown;

export type PluginCliLoadContext = unknown;

export type PluginCliRegistryLoadResult = unknown;

export type PluginCliCommandGroupEntry = unknown;

export function createPluginCliLogger(...args: unknown[]): unknown {
  throw new Error("not implemented: createPluginCliLogger");
}

export function resolvePluginCliLoadContext(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginCliLoadContext");
}







