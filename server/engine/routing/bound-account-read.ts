import { logger } from '../../logger.js';
import {
  normalizeRouteBindingChannelId,
  normalizeRouteBindingId,
  normalizeRouteBindingRoles,
  resolveNormalizedRouteBindingMatch,
  routeBindingScopeMatches,
} from './binding-scope.js';
import { listBindings } from './bindings.js';
import { peerKindMatches, normalizeChatType } from './peer-kind-match.js';
import { normalizeAgentId } from './session-key.js';
import type { ChatType, RouteBinding } from './types.js';

function resolveNormalizedBoundAccountMatch(binding: RouteBinding): {
  agentId: string;
  accountId: string;
  channelId: string;
  peerId?: string;
  peerKind?: ChatType;
  guildId?: string | null;
  teamId?: string | null;
  roles?: string[] | null;
} | null {
  const baseMatch = resolveNormalizedRouteBindingMatch(binding);
  const match = binding.match;
  if (!baseMatch || !match || typeof match !== 'object') {
    return null;
  }
  const peerId = match.peer && typeof match.peer.id === 'string' ? match.peer.id.trim() : undefined;
  const peerKind = match.peer ? normalizeChatType(match.peer.kind) ?? undefined : undefined;
  return {
    ...baseMatch,
    peerId: peerId || undefined,
    peerKind,
    guildId: normalizeRouteBindingId(match.guildId) || null,
    teamId: normalizeRouteBindingId(match.teamId) || null,
    roles: normalizeRouteBindingRoles(match.roles),
  };
}

function buildExactPeerIdSet(params: {
  peerId?: string;
  exactPeerIdAliases?: string[];
}): Set<string> {
  const exactPeerIds = new Set<string>();
  const peerId = params.peerId?.trim();
  if (peerId) {
    exactPeerIds.add(peerId);
  }
  for (const alias of params.exactPeerIdAliases ?? []) {
    const trimmed = alias.trim();
    if (trimmed) {
      exactPeerIds.add(trimmed);
    }
  }
  return exactPeerIds;
}

export function resolveFirstBoundAccountId(params: {
  channelId: string;
  agentId: string;
  peerId?: string;
  exactPeerIdAliases?: string[];
  peerKind?: ChatType;
  groupSpace?: string | null;
  memberRoleIds?: string[];
}): string | undefined {
  const normalizedChannel = normalizeRouteBindingChannelId(params.channelId);
  if (!normalizedChannel) {
    return undefined;
  }
  const normalizedAgentId = normalizeAgentId(params.agentId);
  const normalizedPeerId = params.peerId?.trim() || undefined;
  const exactPeerIds = buildExactPeerIdSet({
    peerId: normalizedPeerId,
    exactPeerIdAliases: params.exactPeerIdAliases,
  });
  const hasPeerContext = exactPeerIds.size > 0;
  const normalizedPeerKind = normalizeChatType(params.peerKind) ?? undefined;
  let wildcardPeerMatch: string | undefined;
  let channelOnlyFallback: string | undefined;

  for (const binding of listBindings(params.channelId)) {
    const resolved = resolveNormalizedBoundAccountMatch(binding);
    if (
      !resolved ||
      resolved.channelId !== normalizedChannel ||
      resolved.agentId !== normalizedAgentId
    ) {
      continue;
    }
    if (
      !routeBindingScopeMatches(resolved, {
        groupSpace: params.groupSpace,
        memberRoleIds: params.memberRoleIds,
      })
    ) {
      continue;
    }
    if (!hasPeerContext) {
      logger.debug(`[Routing:BoundAccount] Found binding without peer context: ${resolved.accountId}`);
      return resolved.accountId;
    }
    if (resolved.peerId === '*') {
      if (
        !resolved.peerKind ||
        !normalizedPeerKind ||
        !peerKindMatches(resolved.peerKind, normalizedPeerKind)
      ) {
        continue;
      }
      wildcardPeerMatch ??= resolved.accountId;
    } else if (resolved.peerId) {
      if (
        resolved.peerKind &&
        normalizedPeerKind &&
        !peerKindMatches(resolved.peerKind, normalizedPeerKind)
      ) {
        continue;
      }
      if (exactPeerIds.has(resolved.peerId)) {
        logger.debug(`[Routing:BoundAccount] Exact peer match: ${resolved.accountId}`);
        return resolved.accountId;
      }
    } else {
      channelOnlyFallback ??= resolved.accountId;
    }
  }

  const result = wildcardPeerMatch ?? channelOnlyFallback;
  logger.debug(`[Routing:BoundAccount] Resolved account: ${result ?? 'none'}`);
  return result;
}
