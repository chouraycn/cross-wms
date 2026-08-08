// 移植自 openclaw/src/config/commands.ts

export function resolveNativeSkillsEnabled(...args: unknown[]): unknown {
  return undefined;
}
export function resolveNativeCommandsEnabled(...args: unknown[]): unknown {
  return undefined;
}
export function isNativeCommandsExplicitlyDisabled(...args: unknown[]): unknown {
  return false;
}
export type isCommandFlagEnabled = unknown;
export const isCommandFlagEnabled: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
export type isRestartEnabled = unknown;
export const isRestartEnabled: (...args: unknown[]) => unknown = undefined as unknown as (...args: unknown[]) => unknown;
