// 移植自 openclaw/src/channels/plugins/message-action-discovery.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ChannelMessageActionDiscoveryInput = unknown;

export function resolveMessageActionDiscoveryChannelId(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveMessageActionDiscoveryChannelId");
}

export function createMessageActionDiscoveryContext(..._args: unknown[]): unknown {
  throw new Error("not implemented: createMessageActionDiscoveryContext");
}

export function resolveCurrentChannelMessageToolDiscoveryAdapter(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveCurrentChannelMessageToolDiscoveryAdapter");
}

export function resolveMessageActionDiscoveryForPlugin(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveMessageActionDiscoveryForPlugin");
}

export function listCrossChannelSchemaSupportedMessageActions(..._args: unknown[]): unknown {
  throw new Error("not implemented: listCrossChannelSchemaSupportedMessageActions");
}

export function listChannelMessageCapabilities(..._args: unknown[]): unknown {
  throw new Error("not implemented: listChannelMessageCapabilities");
}

export function listChannelMessageCapabilitiesForChannel(..._args: unknown[]): unknown {
  throw new Error("not implemented: listChannelMessageCapabilitiesForChannel");
}

export function resolveChannelMessageToolSchemaProperties(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelMessageToolSchemaProperties");
}

export function resolveChannelMessageToolMediaSourceParamKeys(..._args: unknown[]): unknown {
  throw new Error("not implemented: resolveChannelMessageToolMediaSourceParamKeys");
}

export function channelSupportsMessageCapability(..._args: unknown[]): unknown {
  throw new Error("not implemented: channelSupportsMessageCapability");
}

export function channelSupportsMessageCapabilityForChannel(..._args: unknown[]): unknown {
  throw new Error("not implemented: channelSupportsMessageCapabilityForChannel");
}

export const testing_message_action_discovery: unknown = undefined;

export const __testing: unknown = undefined;
