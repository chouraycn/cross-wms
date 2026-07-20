// 移植自 openclaw/src/gateway/server-http.test-harness.ts
// 注意：本文件为测试基础设施 stub，仅用于占位，不包含实际测试逻辑。

export const AUTH_NONE: unknown = undefined;

export const AUTH_TOKEN: unknown = undefined;

export function createRequest(...args: unknown[]): unknown {
  return undefined;
}

export function createHookRequest(...args: unknown[]): unknown {
  return undefined;
}

export function createResponse(...args: unknown[]): unknown {
  return undefined;
}

export async function dispatchRequest(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function withGatewayTempConfig(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function createTestGatewayServer(...args: unknown[]): unknown {
  return undefined;
}

export async function withGatewayServer(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function sendRequest(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function expectUnauthorizedResponse(...args: unknown[]): unknown {
  return undefined;
}

export function createCanonicalizedChannelPluginHandler(...args: unknown[]): unknown {
  return undefined;
}

export function createHooksHandler(...args: unknown[]): unknown {
  return undefined;
}

export const CANONICAL_UNAUTH_VARIANTS: unknown = undefined;

export const CANONICAL_AUTH_VARIANTS: unknown = undefined;

export function buildChannelPathFuzzCorpus(...args: unknown[]): unknown {
  return undefined;
}

export async function expectUnauthorizedVariants(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function expectAuthorizedVariants(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
