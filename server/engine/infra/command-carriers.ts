// 移植自 openclaw/src/infra/command-carriers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ParsedEnvInvocationPrelude = unknown;
export function isEnvAssignmentToken(...args: unknown[]): unknown {
  throw new Error("not implemented: isEnvAssignmentToken");
}
export function parseEnvInvocationPrelude(...args: unknown[]): unknown {
  throw new Error("not implemented: parseEnvInvocationPrelude");
}
export function envInvocationUsesModifiers(...args: unknown[]): unknown {
  throw new Error("not implemented: envInvocationUsesModifiers");
}
export function unwrapEnvInvocation(...args: unknown[]): unknown {
  throw new Error("not implemented: unwrapEnvInvocation");
}
export function resolveEnvCarriedArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveEnvCarriedArgv");
}
export function resolveCarrierCommandArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveCarrierCommandArgv");
}
export const COMMAND_CARRIER_EXECUTABLES: unknown = undefined;
export const SOURCE_EXECUTABLES: unknown = undefined;
