// 移植自 openclaw/src/channels/plugins/setup-wizard-binary.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function createDetectedBinaryStatus(..._args: unknown[]): unknown {
  throw new Error("not implemented: createDetectedBinaryStatus");
}

export function createCliPathTextInput(..._args: unknown[]): unknown {
  throw new Error("not implemented: createCliPathTextInput");
}

export function createDelegatedSetupWizardStatusResolvers(..._args: unknown[]): unknown {
  throw new Error("not implemented: createDelegatedSetupWizardStatusResolvers");
}

export function createDelegatedTextInputShouldPrompt(..._args: unknown[]): unknown {
  throw new Error("not implemented: createDelegatedTextInputShouldPrompt");
}
