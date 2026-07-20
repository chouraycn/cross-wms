// 移植自 openclaw/src/channels/plugins/native-approval-prompt.ts

export const NATIVE_APPROVAL_PROMPT_RUNTIME_CAPABILITY: unknown = undefined;

export function channelPluginHasNativeApprovalPromptUi(..._args: unknown[]): unknown {
  return undefined;
}

export function isKnownNativeApprovalPromptChannel(..._args: unknown[]): unknown {
  return false;
}

export function hasNativeApprovalPromptRuntimeCapability(..._args: unknown[]): unknown {
  return false;
}
