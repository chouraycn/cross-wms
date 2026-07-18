// 移植自 openclaw/src/config/talk.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function normalizeTalkSection(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeTalkSection");
}
export function normalizeTalkConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeTalkConfig");
}
export function resolveActiveTalkProviderConfig(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveActiveTalkProviderConfig");
}
export function buildTalkConfigResponse(...args: unknown[]): unknown {
  throw new Error("not implemented: buildTalkConfigResponse");
}
