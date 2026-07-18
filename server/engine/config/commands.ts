// 移植自 openclaw/src/config/commands.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function resolveNativeSkillsEnabled(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveNativeSkillsEnabled");
}
export function resolveNativeCommandsEnabled(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveNativeCommandsEnabled");
}
export function isNativeCommandsExplicitlyDisabled(...args: unknown[]): unknown {
  throw new Error("not implemented: isNativeCommandsExplicitlyDisabled");
}
export type isCommandFlagEnabled = unknown;
export const isCommandFlagEnabled: unknown = undefined;
export type isRestartEnabled = unknown;
export const isRestartEnabled: unknown = undefined;
