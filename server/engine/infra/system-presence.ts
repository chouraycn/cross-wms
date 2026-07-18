// 移植自 openclaw/src/infra/system-presence.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SystemPresence = unknown;
export function updateSystemPresence(...args: unknown[]): unknown {
  throw new Error("not implemented: updateSystemPresence");
}
export function upsertPresence(...args: unknown[]): unknown {
  throw new Error("not implemented: upsertPresence");
}
export function listSystemPresence(...args: unknown[]): unknown {
  throw new Error("not implemented: listSystemPresence");
}
