// 移植自 openclaw/src/config/runtime-schema.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function loadGatewayRuntimeConfigSchema(...args: unknown[]): unknown {
  throw new Error("not implemented: loadGatewayRuntimeConfigSchema");
}
export function readBestEffortRuntimeConfigSchema(...args: unknown[]): unknown {
  throw new Error("not implemented: readBestEffortRuntimeConfigSchema");
}
