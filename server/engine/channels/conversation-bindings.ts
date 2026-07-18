// 移植自 openclaw/src/channels/plugins/conversation-bindings.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export async function createChannelConversationBindingManager(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: createChannelConversationBindingManager");
}

export function setChannelConversationBindingIdleTimeoutBySessionKey(..._args: unknown[]): unknown {
  throw new Error("not implemented: setChannelConversationBindingIdleTimeoutBySessionKey");
}

export function setChannelConversationBindingMaxAgeBySessionKey(..._args: unknown[]): unknown {
  throw new Error("not implemented: setChannelConversationBindingMaxAgeBySessionKey");
}
