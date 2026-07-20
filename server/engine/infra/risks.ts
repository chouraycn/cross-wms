// 移植自 openclaw/src/infra/risks.ts

export type CommandCarrierHit = unknown;
export type CarriedShellBuiltinHit = unknown;
export function buildCommandPayloadCandidates(...args: unknown[]): unknown {
  return undefined;
}
export function detectCarrierInlineEvalArgv(...args: unknown[]): unknown {
  return undefined;
}
export function detectInlineEvalArgv(...args: unknown[]): unknown {
  return undefined;
}
export function detectInlineEvalInSegments(...args: unknown[]): unknown {
  return undefined;
}
export function detectCommandCarrierArgv(...args: unknown[]): unknown {
  return undefined;
}
export function detectEnvSplitStringFlag(...args: unknown[]): unknown {
  return undefined;
}
export function detectShellWrapperThroughCarrierArgv(...args: unknown[]): unknown {
  return undefined;
}
export function detectCarriedShellBuiltinArgv(...args: unknown[]): unknown {
  return undefined;
}
export type COMMAND_CARRIER_EXECUTABLES = unknown;
export type resolveCarrierCommandArgv = unknown;
export type SOURCE_EXECUTABLES = unknown;
