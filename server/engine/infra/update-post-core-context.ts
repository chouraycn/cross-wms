// 移植自 openclaw/src/infra/update-post-core-context.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PreUpdateConfigRestoreInput = unknown;
export const POST_CORE_UPDATE_SOURCE_CONFIG_PATH_ENV: string = "OPENCLAW_UPDATE_POST_CORE_SOURCE_CONFIG_PATH";
