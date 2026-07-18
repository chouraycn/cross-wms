// 移植自 openclaw/src/plugins/install-fixtures.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function createBundleInstallFixtureFactory(...args: unknown[]): unknown {
  throw new Error("not implemented: createBundleInstallFixtureFactory");
}
export function createDualFormatInstallFixtureFactory(...args: unknown[]): unknown {
  throw new Error("not implemented: createDualFormatInstallFixtureFactory");
}
