// 移植自 openclaw/src/config/nix-mode-write-guard.ts

export function formatNixModeConfigMutationMessage(...args: unknown[]): unknown {
  return "";
}
export function assertConfigWriteAllowedInCurrentMode(...args: unknown[]): unknown {
  return undefined;
}
export const NIX_OPENCLAW_AGENT_FIRST_URL: unknown = undefined;
export const OPENCLAW_NIX_OVERVIEW_URL: unknown = undefined;
export class NixModeConfigMutationError {
  // Stub: not fully ported
}
