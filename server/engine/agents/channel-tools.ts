/**
 * Channel-owned agent tool and prompt helpers.
 * Ported from openclaw/src/agents/channel-tools.ts
 *
 * Discovers channel tools, message actions, prompt capabilities, reaction
 * guidance, and weakly-attached channel metadata for wrapped tools.
 *
 * In cross-wms the full channel plugin system is not available, so all
 * discovery functions return empty results.
 */

import { getChannelPlugin } from "../../channels/_openclaw-stubs.js";
import { normalizeChannelId } from "../../channels/_openclaw-stubs.js";
import { copyChannelAgentToolMeta, getChannelAgentToolMeta } from "./channel-tool-metadata.js";

export { copyChannelAgentToolMeta, getChannelAgentToolMeta } from "./channel-tool-metadata.js";

type ChannelMessageActionName = string;

type ChannelMessageActionDiscoveryParams = {
  cfg?: Record<string, unknown>;
  currentChannelId?: string | null;
  currentThreadTs?: string | null;
  currentMessageId?: string | number | null;
  accountId?: string | null;
  sessionKey?: string | null;
  sessionId?: string | null;
  agentId?: string | null;
  requesterSenderId?: string | null;
};

/**
 * Get the list of supported message actions for a specific channel.
 * Returns an empty array if channel is not found or has no actions configured.
 */
export function listChannelSupportedActions(
  _params: ChannelMessageActionDiscoveryParams & {
    channel?: string;
  },
): ChannelMessageActionName[] {
  // Channel plugin action discovery not available in cross-wms.
  return [];
}

/**
 * Get the list of all supported message actions across all configured channels.
 */
export function listAllChannelSupportedActions(
  _params: ChannelMessageActionDiscoveryParams,
): ChannelMessageActionName[] {
  // Channel plugin action discovery not available in cross-wms.
  return [];
}

type ChannelAgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (toolCallId: string, args: unknown, signal: AbortSignal) => Promise<unknown>;
};

/** List agent tools contributed by registered channel plugins. */
export function listChannelAgentTools(_params: { cfg?: Record<string, unknown> }): ChannelAgentTool[] {
  // Channel plugin tool discovery not available in cross-wms.
  return [];
}

/** Resolve channel-specific message tool hints for system prompt assembly. */
export function resolveChannelMessageToolHints(_params: {
  cfg?: Record<string, unknown>;
  channel?: string | null;
  accountId?: string | null;
}): string[] {
  const channelId = normalizeChannelId(_params.channel);
  if (!channelId) {
    return [];
  }
  const plugin = getChannelPlugin(channelId);
  if (!plugin) {
    return [];
  }
  // Full agent prompt resolution requires the channel plugin runtime.
  return [];
}

/** Resolve channel prompt capabilities, including native approval UI support. */
export function resolveChannelPromptCapabilities(_params: {
  cfg?: Record<string, unknown>;
  channel?: string | null;
  accountId?: string | null;
}): string[] {
  const channelId = normalizeChannelId(_params.channel);
  if (!channelId) {
    return [];
  }
  const plugin = getChannelPlugin(channelId);
  if (!plugin) {
    return [];
  }
  // Full capability resolution requires the channel plugin runtime.
  return [];
}

/** Resolve optional channel reaction guidance for assistant replies. */
export function resolveChannelReactionGuidance(_params: {
  cfg?: Record<string, unknown>;
  channel?: string | null;
  accountId?: string | null;
}): { level: "minimal" | "extensive"; channel: string } | undefined {
  const channelId = normalizeChannelId(_params.channel);
  if (!channelId) {
    return undefined;
  }
  const plugin = getChannelPlugin(channelId);
  if (!plugin) {
    return undefined;
  }
  // Full reaction guidance resolution requires the channel plugin runtime.
  return undefined;
}

/** Test-only utilities for channel tool discovery state. */
export const testing = {
  resetLoggedListActionErrors() {
    // No-op in cross-wms.
  },
};
