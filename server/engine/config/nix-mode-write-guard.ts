// 移植自 openclaw/src/config/nix-mode-write-guard.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function formatNixModeConfigMutationMessage(...args: unknown[]): unknown {
  throw new Error("not implemented: formatNixModeConfigMutationMessage");
}
export function assertConfigWriteAllowedInCurrentMode(...args: unknown[]): unknown {
  throw new Error("not implemented: assertConfigWriteAllowedInCurrentMode");
}
export const NIX_OPENCLAW_AGENT_FIRST_URL: unknown = undefined;
export const OPENCLAW_NIX_OVERVIEW_URL: unknown = undefined;
export class NixModeConfigMutationError {
  constructor(...args: unknown[]) { throw new Error("not implemented: NixModeConfigMutationError"); }
}
