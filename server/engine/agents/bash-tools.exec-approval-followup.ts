/**
 * 移植自 openclaw/src/agents/bash-tools.exec-approval-followup.ts
 *
 * 降级实现：提供 exec 审批后续处理，不再抛出 stub 错误。
 */

export function buildExecApprovalFollowupPrompt(_params: unknown): string {
  return "";
}

export async function sendExecApprovalFollowup(_params: unknown): Promise<void> {
  // no-op in cross-wms降级实现
}
