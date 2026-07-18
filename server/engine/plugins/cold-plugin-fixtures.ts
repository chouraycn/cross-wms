// 移植自 openclaw/src/plugins/cold-plugin-fixtures.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function createColdPluginFixture(...args: unknown[]): unknown {
  throw new Error("not implemented: createColdPluginFixture");
}
export function createColdPluginConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: createColdPluginConfig");
}
export function createColdPluginHermeticEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: createColdPluginHermeticEnv");
}
export function isColdPluginRuntimeLoaded(...args: unknown[]): unknown {
  throw new Error("not implemented: isColdPluginRuntimeLoaded");
}
