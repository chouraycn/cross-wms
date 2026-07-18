// 移植自 openclaw/src/config/commands.flags.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type CommandFlagKey = unknown;
export function isCommandFlagEnabled(...args: unknown[]): unknown {
  throw new Error("not implemented: isCommandFlagEnabled");
}
export function isRestartEnabled(...args: unknown[]): unknown {
  throw new Error("not implemented: isRestartEnabled");
}
