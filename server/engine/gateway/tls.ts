// 移植自 openclaw/src/gateway/server/tls.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function loadGatewayTlsRuntime(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: loadGatewayTlsRuntime");
}
