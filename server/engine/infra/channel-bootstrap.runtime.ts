// 移植自 openclaw/src/infra/channel-bootstrap.runtime.ts
// 降级：channel plugin 运行时依赖简化

let testBootstrapState = new Map<string, unknown>();

/** Resets outbound channel bootstrap state (for tests). */
export function resetOutboundChannelBootstrapStateForTests(): void {
  testBootstrapState.clear();
}

/** Bootstraps an outbound channel plugin. Simplified without real plugin loading. */
export async function bootstrapOutboundChannelPlugin(params: {
  channel: string;
  cfg?: unknown;
  accountId?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!params.channel?.trim()) {
    return { ok: false, error: "missing channel" };
  }
  testBootstrapState.set(params.channel, { bootstrapped: true });
  return { ok: true };
}
