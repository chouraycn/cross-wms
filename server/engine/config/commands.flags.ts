// 移植自 openclaw/src/config/commands.flags.ts

export type CommandFlagKey = unknown;
export function isCommandFlagEnabled(...args: unknown[]): unknown {
  return false;
}
export function isRestartEnabled(...args: unknown[]): unknown {
  return false;
}
