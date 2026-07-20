// 移植自 openclaw/src/infra/approval-native-runtime.ts
// 降级：channel approval delivery 依赖简化

export type PreparedChannelNativeApprovalTarget = {
  to: string;
  threadId?: string;
  surface: "origin" | "approver-dm";
  [key: string]: unknown;
};

/** Delivers an approval request via channel native plan. Simplified without real delivery. */
export async function deliverApprovalRequestViaChannelNativePlan(params: {
  targets?: PreparedChannelNativeApprovalTarget[];
  payload?: unknown;
  cfg?: unknown;
}): Promise<{ ok: boolean; deliveredTargets: PreparedChannelNativeApprovalTarget[]; error?: string }> {
  if (!params.targets?.length) {
    return { ok: false, deliveredTargets: [], error: "no targets" };
  }
  // Simplified: no real delivery
  return { ok: false, deliveredTargets: [], error: "native approval delivery not available" };
}

/** Creates a channel native approval runtime. Simplified without real channel integration. */
export function createChannelNativeApprovalRuntime(_params?: unknown): null {
  return null;
}
