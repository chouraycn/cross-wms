// 移植自 openclaw/src/infra/targets.runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type resolveOutboundTarget = unknown;
export const resolveOutboundTarget: unknown = undefined;
