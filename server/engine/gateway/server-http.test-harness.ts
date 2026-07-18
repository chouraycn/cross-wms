// 移植自 openclaw/src/gateway/server-http.test-harness.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 注意：本文件为测试基础设施 stub，仅用于占位，不包含实际测试逻辑。

export const AUTH_NONE: unknown = undefined;

export const AUTH_TOKEN: unknown = undefined;

export function createRequest(...args: unknown[]): unknown {
  throw new Error("not implemented: createRequest");
}

export function createHookRequest(...args: unknown[]): unknown {
  throw new Error("not implemented: createHookRequest");
}

export function createResponse(...args: unknown[]): unknown {
  throw new Error("not implemented: createResponse");
}

export async function dispatchRequest(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: dispatchRequest");
}

export async function withGatewayTempConfig(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: withGatewayTempConfig");
}

export function createTestGatewayServer(...args: unknown[]): unknown {
  throw new Error("not implemented: createTestGatewayServer");
}

export async function withGatewayServer(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: withGatewayServer");
}

export async function sendRequest(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: sendRequest");
}

export function expectUnauthorizedResponse(...args: unknown[]): unknown {
  throw new Error("not implemented: expectUnauthorizedResponse");
}

export function createCanonicalizedChannelPluginHandler(...args: unknown[]): unknown {
  throw new Error("not implemented: createCanonicalizedChannelPluginHandler");
}

export function createHooksHandler(...args: unknown[]): unknown {
  throw new Error("not implemented: createHooksHandler");
}

export const CANONICAL_UNAUTH_VARIANTS: unknown = undefined;

export const CANONICAL_AUTH_VARIANTS: unknown = undefined;

export function buildChannelPathFuzzCorpus(...args: unknown[]): unknown {
  throw new Error("not implemented: buildChannelPathFuzzCorpus");
}

export async function expectUnauthorizedVariants(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: expectUnauthorizedVariants");
}

export async function expectAuthorizedVariants(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: expectAuthorizedVariants");
}
