// 移植自 openclaw/src/infra/approval-native-route-notice.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function describeApprovalDeliveryDestination(...args: unknown[]): unknown {
  throw new Error("not implemented: describeApprovalDeliveryDestination");
}
export function resolveApprovalRoutedElsewhereNoticeText(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalRoutedElsewhereNoticeText");
}
export function resolveApprovalDeliveryFailedNoticeText(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalDeliveryFailedNoticeText");
}
