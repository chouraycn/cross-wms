// 移植自 openclaw/src/gateway/server-methods/config-write-flow.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfigWriteSnapshot = unknown;

export type ConfigWriteOptions = unknown;

export function resolveGatewayConfigPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveGatewayConfigPath");
}

export function didSharedGatewayAuthChange(...args: unknown[]): unknown {
  throw new Error("not implemented: didSharedGatewayAuthChange");
}

export function didActiveSharedGatewayAuthChange(...args: unknown[]): unknown {
  throw new Error("not implemented: didActiveSharedGatewayAuthChange");
}

export async function commitGatewayConfigWrite(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: commitGatewayConfigWrite");
}

export async function resolveGatewayConfigRestartWriteResult(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: resolveGatewayConfigRestartWriteResult");
}
