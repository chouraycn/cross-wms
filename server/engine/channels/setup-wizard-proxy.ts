// 移植自 openclaw/src/channels/plugins/setup-wizard-proxy.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function createDelegatedResolveConfigured(..._args: unknown[]): unknown {
  throw new Error("not implemented: createDelegatedResolveConfigured");
}

export function createDelegatedPrepare(..._args: unknown[]): unknown {
  throw new Error("not implemented: createDelegatedPrepare");
}

export function createDelegatedFinalize(..._args: unknown[]): unknown {
  throw new Error("not implemented: createDelegatedFinalize");
}

export function createDelegatedSetupWizardProxy(..._args: unknown[]): unknown {
  throw new Error("not implemented: createDelegatedSetupWizardProxy");
}

export function createAllowlistSetupWizardProxy(..._args: unknown[]): unknown {
  throw new Error("not implemented: createAllowlistSetupWizardProxy");
}
