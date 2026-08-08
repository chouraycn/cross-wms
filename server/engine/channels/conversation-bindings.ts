// 移植自 openclaw/src/channels/plugins/conversation-bindings.ts

export async function createChannelConversationBindingManager(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function setChannelConversationBindingIdleTimeoutBySessionKey(..._args: any[]): any {
  return undefined;
}

export function setChannelConversationBindingMaxAgeBySessionKey(..._args: any[]): any {
  return undefined;
}
