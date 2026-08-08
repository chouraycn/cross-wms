// 移植自 openclaw/src/config/nix-mode-write-guard.ts

export function formatNixModeConfigMutationMessage(...args: any[]): any {
  return "";
}
export function assertConfigWriteAllowedInCurrentMode(...args: any[]): any {
  return undefined;
}
export const NIX_OPENCLAW_AGENT_FIRST_URL: any = undefined as any;
export const OPENCLAW_NIX_OVERVIEW_URL: any = undefined as any;
export class NixModeConfigMutationError {
  // Stub: not fully ported
}
