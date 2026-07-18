// 移植自 openclaw/src/channels/plugins/approvals.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveChannelApprovalCapability(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelApprovalCapability");
}

export function resolveChannelApprovalAdapter(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelApprovalAdapter");
}
