// 移植自 openclaw/src/infra/message.config.runtime.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type getRuntimeConfig = unknown;
export const getRuntimeConfig: unknown = undefined;
