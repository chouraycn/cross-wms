// 移植自 openclaw/src/infra/approval-native-route-coordinator.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function hasActiveApprovalNativeRouteRuntime(...args: unknown[]): unknown {
  throw new Error("not implemented: hasActiveApprovalNativeRouteRuntime");
}
export function createApprovalNativeRouteReporter(...args: unknown[]): unknown {
  throw new Error("not implemented: createApprovalNativeRouteReporter");
}
export function clearApprovalNativeRouteStateForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: clearApprovalNativeRouteStateForTest");
}
