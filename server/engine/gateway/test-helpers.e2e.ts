// 移植自 openclaw/src/gateway/test-helpers.e2e.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 注意：本文件为测试基础设施 stub，仅用于占位，不包含实际测试逻辑。

export async function getFreeGatewayPort(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: getFreeGatewayPort");
}

export async function connectGatewayClient(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: connectGatewayClient");
}

export async function disconnectGatewayClient(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: disconnectGatewayClient");
}

export async function connectDeviceAuthReq(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: connectDeviceAuthReq");
}

export async function startGatewayWithClient(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: startGatewayWithClient");
}
