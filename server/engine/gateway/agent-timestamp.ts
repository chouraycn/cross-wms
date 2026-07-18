// 移植自 openclaw/src/gateway/server-methods/agent-timestamp.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export interface TimestampInjectionOptions { [key: string]: unknown; }

export function buildTimestampPrefix(...args: unknown[]): unknown {
  throw new Error("not implemented: buildTimestampPrefix");
}

export function injectTimestamp(...args: unknown[]): unknown {
  throw new Error("not implemented: injectTimestamp");
}

export function timestampOptsFromConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: timestampOptsFromConfig");
}
