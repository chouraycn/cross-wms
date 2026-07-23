// 移植自 openclaw/src/channels/plugins/message-tool-api.ts

import type {
  ChannelMessageActionAdapter,
  ChannelMessageActionDiscoveryContext,
  ChannelMessageToolDiscovery,
} from "./types.public.js";

export type ChannelMessageToolDiscoveryAdapter = ChannelMessageActionAdapter;

export function resolveBundledChannelMessageToolDiscoveryAdapter(
  ..._args: unknown[]
): ChannelMessageToolDiscoveryAdapter | undefined {
  return undefined;
}

export type { ChannelMessageActionDiscoveryContext, ChannelMessageToolDiscovery };
