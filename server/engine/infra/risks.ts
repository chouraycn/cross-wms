// 移植自 openclaw/src/infra/risks.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type CommandCarrierHit = unknown;
export type CarriedShellBuiltinHit = unknown;
export function buildCommandPayloadCandidates(...args: unknown[]): unknown {
  throw new Error("not implemented: buildCommandPayloadCandidates");
}
export function detectCarrierInlineEvalArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: detectCarrierInlineEvalArgv");
}
export function detectInlineEvalArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: detectInlineEvalArgv");
}
export function detectInlineEvalInSegments(...args: unknown[]): unknown {
  throw new Error("not implemented: detectInlineEvalInSegments");
}
export function detectCommandCarrierArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: detectCommandCarrierArgv");
}
export function detectEnvSplitStringFlag(...args: unknown[]): unknown {
  throw new Error("not implemented: detectEnvSplitStringFlag");
}
export function detectShellWrapperThroughCarrierArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: detectShellWrapperThroughCarrierArgv");
}
export function detectCarriedShellBuiltinArgv(...args: unknown[]): unknown {
  throw new Error("not implemented: detectCarriedShellBuiltinArgv");
}
export type COMMAND_CARRIER_EXECUTABLES = unknown;
export type resolveCarrierCommandArgv = unknown;
export type SOURCE_EXECUTABLES = unknown;
