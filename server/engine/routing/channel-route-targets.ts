import { logger } from '../../logger.js';
import { listBindings } from './bindings.js';
import { resolveAgentRoute } from './resolve-route.js';
import { DEFAULT_ACCOUNT_ID, normalizeAccountId, normalizeAgentId } from './session-key.js';
import type { ChannelRouteTarget, RouteBinding } from './types.js';

export interface ChannelConfig {
  channels?: Record<string, { enabled?: boolean; accounts?: Record<string, { enabled?: boolean }> }>;
  bindings?: RouteBinding[];
  agents?: { list?: { id: string }[]; defaultAgentId?: string };
  session?: { dmScope?: string };
}

const CHANNELS_CONFIG_META_KEYS = new Set(['defaults', 'modelByChannel']);

function normalizeConfiguredChannelKey(raw?: string | null): string {
  return String(raw ?? '').trim().toLowerCase();
}

function listConfiguredChannelIds(cfg: ChannelConfig): string[] {
  if (!cfg.channels || typeof cfg.channels !== 'object') {
    return [];
  }
  return Object.entries(cfg.channels)
    .filter(([id, value]) => {
      if (CHANNELS_CONFIG_META_KEYS.has(id)) {
        return false;
      }
      return !(value && typeof value === 'object' && value.enabled === false);
    })
    .map(([id]) => normalizeConfiguredChannelKey(id))
    .filter(Boolean)
    .sort();
}

function listConfiguredChannelAccountIds(cfg: ChannelConfig, channelId: string): string[] {
  if (!cfg.channels || typeof cfg.channels !== 'object') {
    return [];
  }
  const channel = Object.entries(cfg.channels).find(
    ([id]) => normalizeConfiguredChannelKey(id) === channelId,
  )?.[1];
  if (!channel || !channel.accounts || typeof channel.accounts !== 'object') {
    return [];
  }
  return Object.entries(channel.accounts)
    .filter(([, value]) => !(value && typeof value === 'object' && value.enabled === false))
    .map(([accountId]) => normalizeAccountId(accountId))
    .filter(Boolean)
    .sort();
}

function addTarget(byAgent: Map<string, Set<string>>, agentId: string, channel: string): void {
  const normalizedAgentId = normalizeAgentId(agentId);
  const trimmedChannel = channel.trim();
  if (!normalizedAgentId || !trimmedChannel) {
    return;
  }
  const channels = byAgent.get(normalizedAgentId) ?? new Set<string>();
  channels.add(trimmedChannel);
  byAgent.set(normalizedAgentId, channels);
}

export function collectChannelRouteTargets(cfg: ChannelConfig): ChannelRouteTarget[] {
  const byAgent = new Map<string, Set<string>>();

  for (const binding of listBindings()) {
    addTarget(byAgent, binding.agentId, normalizeConfiguredChannelKey(binding.match.channel));
  }

  for (const channel of listConfiguredChannelIds(cfg)) {
    const accountIds = listConfiguredChannelAccountIds(cfg, channel);
    const sampledAccountIds = accountIds.length > 0 ? accountIds : [DEFAULT_ACCOUNT_ID];
    for (const accountId of sampledAccountIds) {
      const route = resolveAgentRoute({
        cfg: cfg as {
          agents?: { list?: { id: string }[]; defaultAgentId?: string };
          session?: { dmScope?: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer' };
        },
        channel,
        accountId,
      });
      addTarget(byAgent, route.agentId, channel);
    }
  }

  const result = Array.from(byAgent.entries())
    .map(([agentId, channels]) => ({
      agentId,
      channels: Array.from(channels).sort(),
    }))
    .filter((target) => target.channels.length > 0)
    .sort((a, b) => a.agentId.localeCompare(b.agentId));

  logger.debug(`[Routing:ChannelRouteTargets] Collected ${result.length} targets`);
  return result;
}
