// 移植自 openclaw/src/infra/delivery-commit-hooks.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type OutboundDeliveryCommitHook = unknown;
export function attachOutboundDeliveryCommitHook(...args: unknown[]): unknown {
  throw new Error("not implemented: attachOutboundDeliveryCommitHook");
}
export function runOutboundDeliveryCommitHooks(...args: unknown[]): unknown {
  throw new Error("not implemented: runOutboundDeliveryCommitHooks");
}
export function isOutboundDeliveryResultArray(...args: unknown[]): unknown {
  throw new Error("not implemented: isOutboundDeliveryResultArray");
}
