// 移植自 openclaw/src/gateway/test-helpers.server.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 注意：本文件为测试基础设施 stub，仅用于占位，不包含实际测试逻辑。

export async function writeSessionStore(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: writeSessionStore");
}

export function installGatewayTestHooks(...args: unknown[]): unknown {
  throw new Error("not implemented: installGatewayTestHooks");
}

export async function getFreePort(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: getFreePort");
}

export function getTrackedConnectChallengeNonce(...args: unknown[]): unknown {
  throw new Error("not implemented: getTrackedConnectChallengeNonce");
}

export function trackConnectChallengeNonce(...args: unknown[]): unknown {
  throw new Error("not implemented: trackConnectChallengeNonce");
}

export function onceMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: onceMessage");
}

export async function startGatewayServer(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: startGatewayServer");
}

export async function startGatewayServerWithRetries(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: startGatewayServerWithRetries");
}

export async function withGatewayServer(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: withGatewayServer");
}

export async function createGatewaySuiteHarness(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: createGatewaySuiteHarness");
}

export async function startServer(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: startServer");
}

export async function startServerWithClient(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: startServerWithClient");
}

export async function startConnectedServerWithClient(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: startConnectedServerWithClient");
}

export async function readConnectChallengeNonce(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: readConnectChallengeNonce");
}

export function testOnlyResolveAuthTokenForSignature(...args: unknown[]): unknown {
  throw new Error("not implemented: testOnlyResolveAuthTokenForSignature");
}

export async function connectReq(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: connectReq");
}

export async function connectOk(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: connectOk");
}

export async function connectWebchatClient(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: connectWebchatClient");
}

export async function rpcReq(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: rpcReq");
}

export async function waitForSystemEvent(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: waitForSystemEvent");
}
