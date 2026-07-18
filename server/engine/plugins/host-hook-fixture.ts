// 移植自 openclaw/src/plugins/host-hook-fixture.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function registerHostHookFixture(...args: unknown[]): unknown {
  throw new Error("not implemented: registerHostHookFixture");
}
export function registerTrustedHostHookFixture(...args: unknown[]): unknown {
  throw new Error("not implemented: registerTrustedHostHookFixture");
}
