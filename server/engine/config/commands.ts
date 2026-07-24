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
export const isCommandFlagEnabled: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
export type isRestartEnabled = unknown;
export const isRestartEnabled: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;
