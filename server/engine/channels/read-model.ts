// 移植自 openclaw/src/channels/status/read-model.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type RuntimeChannelStatusPayload = unknown;

export function getRuntimeChannelAccounts(..._args: unknown[]): unknown {
  throw new Error("not implemented: getRuntimeChannelAccounts");
}

export function normalizeRuntimeChannelAccountSnapshots(..._args: unknown[]): unknown {
  throw new Error("not implemented: normalizeRuntimeChannelAccountSnapshots");
}

export function hasRuntimeCredentialAvailable(..._args: unknown[]): unknown {
  throw new Error("not implemented: hasRuntimeCredentialAvailable");
}

export function markConfiguredUnavailableCredentialStatusesAvailable(..._args: unknown[]): unknown {
  throw new Error("not implemented: markConfiguredUnavailableCredentialStatusesAvailable");
}

export async function resolveChannelAccountStatusRows(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: resolveChannelAccountStatusRows");
}
