// 移植自 openclaw/src/config/commands.flags.ts

export type CommandFlagKey = unknown;
export function isCommandFlagEnabled(...args: any[]): any {
  return false;
}
export function isRestartEnabled(...args: any[]): any {
  return false;
}
