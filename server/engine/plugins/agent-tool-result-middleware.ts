/**
 * Applies plugin middleware to agent tool results at runtime boundaries.
 * 移植自 openclaw/src/plugins/agent-tool-result-middleware.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export const AGENT_TOOL_RESULT_MIDDLEWARE_RUNTIMES: unknown = undefined;

export function normalizeAgentToolResultMiddlewareRuntimes(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeAgentToolResultMiddlewareRuntimes");
}

export const normalizeAgentToolResultMiddlewareHarnesses: unknown = undefined;

export function normalizeAgentToolResultMiddlewareRuntimeIds(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeAgentToolResultMiddlewareRuntimeIds");
}

export function listAgentToolResultMiddlewares(...args: unknown[]): unknown {
  throw new Error("not implemented: listAgentToolResultMiddlewares");
}

