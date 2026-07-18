// 移植自 openclaw/src/infra/channel-selection.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type MessageChannelId = unknown;
export type MessageChannelSelectionSource = unknown;
export function isConfiguredChannel(...args: unknown[]): unknown {
  throw new Error("not implemented: isConfiguredChannel");
}
export function listConfiguredMessageChannels(...args: unknown[]): unknown {
  throw new Error("not implemented: listConfiguredMessageChannels");
}
export function resolveMessageChannelSelection(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveMessageChannelSelection");
}
export const testing_channel_selection: unknown = undefined;
export type __testing_channel_selection = unknown;
