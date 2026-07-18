// 移植自 openclaw/src/config/test-helpers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function useTempSessionsFixture(...args: unknown[]): unknown {
  throw new Error("not implemented: useTempSessionsFixture");
}
export function writeSessionStoreForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: writeSessionStoreForTest");
}
export function writeSessionStoreForTestAsync(...args: unknown[]): unknown {
  throw new Error("not implemented: writeSessionStoreForTestAsync");
}
export function readSessionStoreForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: readSessionStoreForTest");
}
export function withTempHome(...args: unknown[]): unknown {
  throw new Error("not implemented: withTempHome");
}
export function writeOpenClawConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: writeOpenClawConfig");
}
export function writeStateDirDotEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: writeStateDirDotEnv");
}
export function withTempHomeConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: withTempHomeConfig");
}
export function withEnvOverride(...args: unknown[]): unknown {
  throw new Error("not implemented: withEnvOverride");
}
export function buildWebSearchProviderConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: buildWebSearchProviderConfig");
}
