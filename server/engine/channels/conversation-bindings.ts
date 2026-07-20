// 移植自 openclaw/src/channels/plugins/conversation-bindings.ts

export async function createChannelConversationBindingManager(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function setChannelConversationBindingIdleTimeoutBySessionKey(..._args: unknown[]): unknown {
  return undefined;
}

export function setChannelConversationBindingMaxAgeBySessionKey(..._args: unknown[]): unknown {
  return undefined;
}
