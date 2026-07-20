// 移植自 openclaw/src/infra/approval-native-route-coordinator.ts

export function hasActiveApprovalNativeRouteRuntime(...args: unknown[]): unknown {
  return false;
}
export function createApprovalNativeRouteReporter(...args: unknown[]): unknown {
  return undefined;
}
export function clearApprovalNativeRouteStateForTest(...args: unknown[]): unknown {
  return undefined;
}
