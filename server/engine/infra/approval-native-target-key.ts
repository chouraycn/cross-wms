// 移植自 openclaw/src/infra/approval-native-target-key.ts

/** Builds the stable dedupe key used to compare channel-native approval targets. */
export function buildChannelApprovalNativeTargetKey(target: {
  to: string;
  threadId?: string;
}): string {
  const parts = [target.to];
  if (target.threadId) parts.push(target.threadId);
  return parts.join("::");
}
