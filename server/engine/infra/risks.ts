// 移植自 openclaw/src/infra/risks.ts

export type CommandCarrierHit = unknown;
export type CarriedShellBuiltinHit = unknown;
export function buildCommandPayloadCandidates(...args: any[]): any {
  return undefined;
}
export function detectCarrierInlineEvalArgv(...args: any[]): any {
  return undefined;
}
export function detectInlineEvalArgv(...args: any[]): any {
  return undefined;
}
export function detectInlineEvalInSegments(...args: any[]): any {
  return undefined;
}
export function detectCommandCarrierArgv(...args: any[]): any {
  return undefined;
}
export function detectEnvSplitStringFlag(...args: any[]): any {
  return undefined;
}
export function detectShellWrapperThroughCarrierArgv(...args: any[]): any {
  return undefined;
}
export function detectCarriedShellBuiltinArgv(...args: any[]): any {
  return undefined;
}
export type COMMAND_CARRIER_EXECUTABLES = unknown;
export type resolveCarrierCommandArgv = unknown;
export type SOURCE_EXECUTABLES = unknown;
