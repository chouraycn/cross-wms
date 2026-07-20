// 移植自 openclaw/src/channels/plugins/setup-group-access-configure.ts
// 降级：channel plugin 依赖简化

/** Configures channel access with an allowlist. Simplified without real channel plugin. */
export async function configureChannelAccessWithAllowlist(params: {
  channel: string;
  allowlist?: string[];
  cfg?: unknown;
}): Promise<{ ok: boolean; error?: string }> {
  if (!params.channel?.trim()) {
    return { ok: false, error: "missing channel" };
  }
  return { ok: true };
}
