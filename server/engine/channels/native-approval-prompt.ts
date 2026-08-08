// 移植自 openclaw/src/channels/plugins/native-approval-prompt.ts

export const NATIVE_APPROVAL_PROMPT_RUNTIME_CAPABILITY: any = undefined as any;

export function channelPluginHasNativeApprovalPromptUi(..._args: any[]): any {
  return undefined;
}

export function isKnownNativeApprovalPromptChannel(..._args: any[]): any {
  return false;
}

export function hasNativeApprovalPromptRuntimeCapability(..._args: any[]): any {
  return false;
}
