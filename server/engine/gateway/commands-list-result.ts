// 移植自 openclaw/src/gateway/server-methods/commands-list-result.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function buildCommandsListResult(...args: unknown[]): unknown {
  throw new Error("not implemented: buildCommandsListResult");
}
