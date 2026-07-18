// 移植自 openclaw/src/config/group.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function buildGroupDisplayName(...args: unknown[]): unknown {
  throw new Error("not implemented: buildGroupDisplayName");
}
export function resolveGroupSessionKey(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveGroupSessionKey");
}
