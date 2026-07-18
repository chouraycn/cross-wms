// 移植自 openclaw/src/plugins/registry-jiti-mocks.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resetRegistryJitiMocks(...args: unknown[]): unknown {
  throw new Error("not implemented: resetRegistryJitiMocks");
}
export function getRegistryJitiMocks(...args: unknown[]): unknown {
  throw new Error("not implemented: getRegistryJitiMocks");
}
