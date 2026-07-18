// 移植自 openclaw/src/channels/plugins/config-writes.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfigWriteScope = unknown;

export type ConfigWriteTarget = unknown;

export type ConfigWriteAuthorizationResult = unknown;

export function resolveChannelConfigWrites(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelConfigWrites");
}

export function authorizeConfigWrite(..._args: unknown[]): unknown {
  throw new Error("not implemented: authorizeConfigWrite");
}

export function resolveExplicitConfigWriteTarget(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveExplicitConfigWriteTarget");
}

export function resolveConfigWriteTargetFromPath(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfigWriteTargetFromPath");
}

export function canBypassConfigWritePolicy(..._args: unknown[]): unknown {
  throw new Error("not implemented: canBypassConfigWritePolicy");
}

export function formatConfigWriteDeniedMessage(..._args: unknown[]): unknown {
  throw new Error("not implemented: formatConfigWriteDeniedMessage");
}
