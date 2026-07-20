// 移植自 openclaw/src/channels/plugins/exec-approval-local.ts

export function shouldSuppressLocalExecApprovalPrompt(..._args: unknown[]): unknown {
  return false;
}
