/**
 * Generates tiny plugin fixtures for plugin loader tests.
 * 移植自 openclaw/src/plugins/generated-plugin-test-helpers.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export const pluginTestRepoRoot: unknown = undefined;

export function writeJson(...args: unknown[]): unknown {
  throw new Error("not implemented: writeJson");
}

export function createGeneratedPluginTempRoot(...args: unknown[]): unknown {
  throw new Error("not implemented: createGeneratedPluginTempRoot");
}

export function installGeneratedPluginTempRootCleanup(...args: unknown[]): unknown {
  throw new Error("not implemented: installGeneratedPluginTempRootCleanup");
}

