// 移植自 openclaw/src/channels/status/read-model.ts

export type RuntimeChannelStatusPayload = unknown;

export function getRuntimeChannelAccounts(..._args: any[]): any {
  return undefined;
}

export function normalizeRuntimeChannelAccountSnapshots(..._args: any[]): any {
  return undefined;
}

export function hasRuntimeCredentialAvailable(..._args: any[]): any {
  return false;
}

export function markConfiguredUnavailableCredentialStatusesAvailable(..._args: any[]): any {
  return undefined;
}

export async function resolveChannelAccountStatusRows(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
