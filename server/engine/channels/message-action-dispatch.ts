// 移植自 openclaw/src/channels/plugins/message-action-dispatch.ts
// 降级：channel plugin / message action 依赖简化

export type MessageActionDispatchResult = {
  ok: boolean;
  error?: string;
  result?: unknown;
};

/** Dispatches a channel message action. Simplified without real channel plugin. */
export async function dispatchChannelMessageAction(params: {
  action: string;
  channel?: string;
  args?: Record<string, unknown>;
  cfg?: unknown;
}): Promise<MessageActionDispatchResult> {
  return { ok: false, error: `channel dispatch not available: ${params.action}` };
}
