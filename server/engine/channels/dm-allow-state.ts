// 移植自 openclaw/src/channels/message-access/dm-allow-state.ts
// 降级：channel plugin 依赖简化

export type DmAllowAuditState = {
  allowed: boolean;
  reason?: string;
  source?: "config" | "allowlist" | "default" | "denied";
};

/** Resolves the DM allow audit state. Simplified without real allowlist access. */
export async function resolveDmAllowAuditState(params: {
  channel: string;
  senderId?: string;
  recipientId?: string;
  cfg?: unknown;
}): Promise<DmAllowAuditState> {
  if (!params.channel?.trim()) {
    return { allowed: false, reason: "missing-channel", source: "denied" };
  }
  return { allowed: true, source: "default" };
}
