// 移植自 openclaw/src/config/commands.ts

export function resolveNativeSkillsEnabled(...args: any[]): any {
  return undefined;
}
export function resolveNativeCommandsEnabled(...args: any[]): any {
  return undefined;
}
export function isNativeCommandsExplicitlyDisabled(...args: any[]): any {
  return false;
}
export type isCommandFlagEnabled = unknown;
export const isCommandFlagEnabled: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
export type isRestartEnabled = unknown;
export const isRestartEnabled: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;
