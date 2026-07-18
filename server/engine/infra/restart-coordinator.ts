// 移植自 openclaw/src/infra/restart-coordinator.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SafeGatewayRestartCounts = unknown;
export type SafeGatewayRestartBlocker = unknown;
export type SafeGatewayRestartPreflight = unknown;
export type SafeGatewayRestartRequestResult = unknown;
export function createSafeGatewayRestartPreflight(...args: unknown[]): unknown {
  throw new Error("not implemented: createSafeGatewayRestartPreflight");
}
export function requestSafeGatewayRestart(...args: unknown[]): unknown {
  throw new Error("not implemented: requestSafeGatewayRestart");
}
