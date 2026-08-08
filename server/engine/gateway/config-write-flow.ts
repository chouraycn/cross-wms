// 移植自 openclaw/src/gateway/server-methods/config-write-flow.ts

export type ConfigWriteSnapshot = unknown;

export type ConfigWriteOptions = unknown;

export function resolveGatewayConfigPath(...args: any[]): any {
  return undefined;
}

export function didSharedGatewayAuthChange(...args: any[]): any {
  return undefined;
}

export function didActiveSharedGatewayAuthChange(...args: any[]): any {
  return undefined;
}

export async function commitGatewayConfigWrite(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export async function resolveGatewayConfigRestartWriteResult(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
