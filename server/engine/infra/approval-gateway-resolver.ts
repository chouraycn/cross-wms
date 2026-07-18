// 移植自 openclaw/src/infra/approval-gateway-resolver.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveApprovalOverGateway(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveApprovalOverGateway");
}
