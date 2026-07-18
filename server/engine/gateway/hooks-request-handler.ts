// 移植自 openclaw/src/gateway/server/hooks-request-handler.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type HookClientIpConfig = unknown;

export type HooksRequestHandler = unknown;

export function createHooksRequestHandler(...args: unknown[]): unknown {
  throw new Error("not implemented: createHooksRequestHandler");
}
