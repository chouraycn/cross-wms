// 移植自 openclaw/src/channels/status/read-model.ts

export type RuntimeChannelStatusPayload = unknown;

export function getRuntimeChannelAccounts(..._args: unknown[]): unknown {
  return undefined;
}

export function normalizeRuntimeChannelAccountSnapshots(..._args: unknown[]): unknown {
  return undefined;
}

export function hasRuntimeCredentialAvailable(..._args: unknown[]): unknown {
  return false;
}

export function markConfiguredUnavailableCredentialStatusesAvailable(..._args: unknown[]): unknown {
  return undefined;
}

export async function resolveChannelAccountStatusRows(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
