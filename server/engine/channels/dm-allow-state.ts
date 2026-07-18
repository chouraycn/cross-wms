// 移植自 openclaw/src/channels/message-access/dm-allow-state.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function resolveDmAllowAuditState(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: resolveDmAllowAuditState");
}
