// 移植自 openclaw/src/channels/plugins/config-write-policy-shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfigWriteScopeLike = unknown;

export type ConfigWriteTargetLike = unknown;

export type ConfigWriteAuthorizationResultLike = unknown;

export function resolveChannelConfigWritesShared(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelConfigWritesShared");
}

export function authorizeConfigWriteShared(..._args: unknown[]): unknown {
  throw new Error("not implemented: authorizeConfigWriteShared");
}

export function resolveExplicitConfigWriteTargetShared(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveExplicitConfigWriteTargetShared");
}

export function resolveConfigWriteTargetFromPathShared(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfigWriteTargetFromPathShared");
}

export function canBypassConfigWritePolicyShared(..._args: unknown[]): unknown {
  throw new Error("not implemented: canBypassConfigWritePolicyShared");
}

export function formatConfigWriteDeniedMessageShared(..._args: unknown[]): unknown {
  throw new Error("not implemented: formatConfigWriteDeniedMessageShared");
}
