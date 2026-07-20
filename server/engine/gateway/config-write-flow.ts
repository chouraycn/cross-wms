// 移植自 openclaw/src/gateway/server-methods/config-write-flow.ts

export type ConfigWriteSnapshot = unknown;

export type ConfigWriteOptions = unknown;

export function resolveGatewayConfigPath(...args: unknown[]): unknown {
  return undefined;
}

export function didSharedGatewayAuthChange(...args: unknown[]): unknown {
  return undefined;
}

export function didActiveSharedGatewayAuthChange(...args: unknown[]): unknown {
  return undefined;
}

export async function commitGatewayConfigWrite(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function resolveGatewayConfigRestartWriteResult(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
