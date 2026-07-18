// 移植自 openclaw/src/channels/plugins/native-approval-prompt.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const NATIVE_APPROVAL_PROMPT_RUNTIME_CAPABILITY: unknown = undefined;

export function channelPluginHasNativeApprovalPromptUi(..._args: unknown[]): unknown {
  throw new Error("not implemented: channelPluginHasNativeApprovalPromptUi");
}

export function isKnownNativeApprovalPromptChannel(..._args: unknown[]): unknown {
  throw new Error("not implemented: isKnownNativeApprovalPromptChannel");
}

export function hasNativeApprovalPromptRuntimeCapability(..._args: unknown[]): unknown {
  throw new Error("not implemented: hasNativeApprovalPromptRuntimeCapability");
}
