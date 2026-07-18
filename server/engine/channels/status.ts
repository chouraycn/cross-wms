// 移植自 openclaw/src/channels/plugins/status.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function buildChannelAccountSnapshotFromAccount(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: buildChannelAccountSnapshotFromAccount");
}

export async function buildReadOnlySourceChannelAccountSnapshot(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: buildReadOnlySourceChannelAccountSnapshot");
}

export async function buildChannelAccountSnapshot(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: buildChannelAccountSnapshot");
}
