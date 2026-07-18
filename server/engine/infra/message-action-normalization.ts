// 移植自 openclaw/src/infra/message-action-normalization.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function normalizeMessageActionInput(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeMessageActionInput");
}
