// 移植自 openclaw/src/infra/node-proxy-agent.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type CreateNodeProxyAgentOptions = unknown;
export function resolveEnvNodeProxyUrlForTarget(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveEnvNodeProxyUrlForTarget");
}
export function createNodeProxyAgent(...args: unknown[]): unknown {
  throw new Error("not implemented: createNodeProxyAgent");
}
export function createFixedNodeProxyAgentPair(...args: unknown[]): unknown {
  throw new Error("not implemented: createFixedNodeProxyAgentPair");
}
export const UNSUPPORTED_PROXY_PROTOCOL_MESSAGE: unknown = undefined;
