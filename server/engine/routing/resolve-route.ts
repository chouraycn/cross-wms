import { logger } from '../../logger.js';
import {
  normalizeRouteBindingId,
  normalizeRouteBindingRoles,
  routeBindingScopeMatches,
} from './binding-scope.js';
import { listBindings } from './bindings.js';
import { peerKindMatches, normalizeChatType } from './peer-kind-match.js';
import {
  buildAgentMainSessionKey,
  buildAgentPeerSessionKey,
  DEFAULT_ACCOUNT_ID,
  DEFAULT_MAIN_KEY,
  normalizeAccountId,
  normalizeAgentId,
} from './session-key.js';
import type {
  ResolvedAgentRoute,
  RoutePeer,
  RouteBinding,
  RouteMatchReason,
  ChatType,
} from './types.js';

export { DEFAULT_ACCOUNT_ID } from './session-key.js';

export interface ResolveAgentRouteInput {
  cfg?: {
    agents?: { list?: { id: string }[]; defaultAgentId?: string };
    session?: { dmScope?: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer' };
  };
  channel: string;
  accountId?: string | null;
  peer?: RoutePeer | null;
  parentPeer?: RoutePeer | null;
  guildId?: string | null;
  teamId?: string | null;
  memberRoleIds?: string[];
}

type NormalizedPeerConstraint =
  | { state: 'none' }
  | { state: 'invalid' }
  | { state: 'wildcard-kind'; kind: ChatType }
  | { state: 'valid'; kind: ChatType; id: string };

type NormalizedBindingMatch = {
  accountPattern: string;
  peer: NormalizedPeerConstraint;
  guildId: string | null;
  teamId: string | null;
  roles: string[] | null;
};

type EvaluatedBinding = {
  binding: RouteBinding;
  match: NormalizedBindingMatch;
  order: number;
};

type BindingScope = {
  peer: RoutePeer | null;
  guildId: string;
  teamId: string;
  memberRoleIds: Set<string>;
};

type EvaluatedBindingsIndex = {
  byPeer: Map<string, EvaluatedBinding[]>;
  byPeerWildcard: EvaluatedBinding[];
  byGuildWithRoles: Map<string, EvaluatedBinding[]>;
  byGuild: Map<string, EvaluatedBinding[]>;
  byTeam: Map<string, EvaluatedBinding[]>;
  byAccount: EvaluatedBinding[];
  byChannel: EvaluatedBinding[];
};

function normalizeToken(value: string | undefined | null): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeId(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') return String(value).trim();
  return '';
}

function resolveDefaultAgentId(cfg?: ResolveAgentRouteInput['cfg']): string {
  return cfg?.agents?.defaultAgentId ?? 'main';
}

function listAgents(cfg?: ResolveAgentRouteInput['cfg']): { id: string }[] {
  const agents = cfg?.agents?.list;
  return Array.isArray(agents) ? agents : [];
}

function pickFirstExistingAgentId(
  cfg: ResolveAgentRouteInput['cfg'] | undefined,
  agentId: string,
): string {
  const trimmed = (agentId ?? '').trim();
  if (!trimmed) {
    return normalizeAgentId(resolveDefaultAgentId(cfg));
  }
  const normalized = normalizeAgentId(trimmed);
  const agents = listAgents(cfg);
  if (agents.length === 0) {
    return normalized;
  }
  const found = agents.find((a) => normalizeAgentId(a.id) === normalized);
  return found ? normalizeAgentId(found.id) : normalizeAgentId(resolveDefaultAgentId(cfg));
}

function normalizePeerConstraint(
  peer: { kind?: string; id?: string } | undefined,
): NormalizedPeerConstraint {
  if (!peer) {
    return { state: 'none' };
  }
  const kind = normalizeChatType(peer.kind);
  const id = normalizeId(peer.id);
  if (!kind || !id) {
    return { state: 'invalid' };
  }
  if (id === '*') {
    return { state: 'wildcard-kind', kind };
  }
  return { state: 'valid', kind, id };
}

function normalizeBindingMatch(
  match: RouteBinding['match'],
): NormalizedBindingMatch {
  const rawRoles = match?.roles;
  return {
    accountPattern: (match?.accountId ?? '').trim(),
    peer: normalizePeerConstraint(match?.peer),
    guildId: normalizeId(match?.guildId) || null,
    teamId: normalizeId(match?.teamId) || null,
    roles: normalizeRouteBindingRoles(rawRoles),
  };
}

function resolveAccountPatternKey(accountPattern: string): string {
  if (!accountPattern.trim()) {
    return DEFAULT_ACCOUNT_ID;
  }
  return normalizeAccountId(accountPattern);
}

function buildEvaluatedBindings(channel: string, accountId: string): EvaluatedBinding[] {
  const allBindings = listBindings();
  const channelNormalized = normalizeToken(channel);
  const accountNormalized = normalizeAccountId(accountId);

  const accountScoped: EvaluatedBinding[] = [];
  const anyAccount: EvaluatedBinding[] = [];
  let order = 0;

  for (const binding of allBindings) {
    const bindingChannel = normalizeToken(binding.match?.channel);
    if (bindingChannel !== channelNormalized) {
      continue;
    }
    const match = normalizeBindingMatch(binding.match);
    const evaluated: EvaluatedBinding = {
      binding,
      match,
      order,
    };
    order += 1;

    if (match.accountPattern === '*') {
      anyAccount.push(evaluated);
      continue;
    }
    const accountKey = resolveAccountPatternKey(match.accountPattern);
    if (accountKey === accountNormalized) {
      accountScoped.push(evaluated);
    }
  }

  return mergeEvaluatedBindingsInSourceOrder(accountScoped, anyAccount);
}

function mergeEvaluatedBindingsInSourceOrder(
  accountScoped: EvaluatedBinding[],
  anyAccount: EvaluatedBinding[],
): EvaluatedBinding[] {
  if (accountScoped.length === 0) {
    return anyAccount;
  }
  if (anyAccount.length === 0) {
    return accountScoped;
  }
  const merged: EvaluatedBinding[] = [];
  let accountIdx = 0;
  let anyIdx = 0;
  while (accountIdx < accountScoped.length && anyIdx < anyAccount.length) {
    const accountBinding = accountScoped[accountIdx];
    const anyBinding = anyAccount[anyIdx];
    if (
      (accountBinding?.order ?? Number.MAX_SAFE_INTEGER) <=
      (anyBinding?.order ?? Number.MAX_SAFE_INTEGER)
    ) {
      if (accountBinding) {
        merged.push(accountBinding);
      }
      accountIdx += 1;
      continue;
    }
    if (anyBinding) {
      merged.push(anyBinding);
    }
    anyIdx += 1;
  }
  if (accountIdx < accountScoped.length) {
    merged.push(...accountScoped.slice(accountIdx));
  }
  if (anyIdx < anyAccount.length) {
    merged.push(...anyAccount.slice(anyIdx));
  }
  return merged;
}

function pushToIndexMap(
  map: Map<string, EvaluatedBinding[]>,
  key: string | null,
  binding: EvaluatedBinding,
): void {
  if (!key) {
    return;
  }
  const existing = map.get(key);
  if (existing) {
    existing.push(binding);
    return;
  }
  map.set(key, [binding]);
}

function peerLookupKeys(kind: ChatType, id: string): string[] {
  if (kind === 'group') {
    return [`group:${id}`, `channel:${id}`];
  }
  if (kind === 'channel') {
    return [`channel:${id}`, `group:${id}`];
  }
  return [`${kind}:${id}`];
}

function collectPeerIndexedBindings(
  index: EvaluatedBindingsIndex,
  peer: RoutePeer | null,
): EvaluatedBinding[] {
  if (!peer) {
    return [];
  }
  const out: EvaluatedBinding[] = [];
  const seen = new Set<EvaluatedBinding>();
  for (const key of peerLookupKeys(peer.kind, peer.id)) {
    const matches = index.byPeer.get(key);
    if (!matches) {
      continue;
    }
    for (const match of matches) {
      if (seen.has(match)) {
        continue;
      }
      seen.add(match);
      out.push(match);
    }
  }
  return out;
}

function buildEvaluatedBindingsIndex(bindings: EvaluatedBinding[]): EvaluatedBindingsIndex {
  const byPeer = new Map<string, EvaluatedBinding[]>();
  const byPeerWildcard: EvaluatedBinding[] = [];
  const byGuildWithRoles = new Map<string, EvaluatedBinding[]>();
  const byGuild = new Map<string, EvaluatedBinding[]>();
  const byTeam = new Map<string, EvaluatedBinding[]>();
  const byAccount: EvaluatedBinding[] = [];
  const byChannel: EvaluatedBinding[] = [];

  for (const binding of bindings) {
    if (binding.match.peer.state === 'valid') {
      for (const key of peerLookupKeys(binding.match.peer.kind, binding.match.peer.id)) {
        pushToIndexMap(byPeer, key, binding);
      }
      continue;
    }
    if (binding.match.peer.state === 'wildcard-kind') {
      byPeerWildcard.push(binding);
      continue;
    }
    if (binding.match.guildId && binding.match.roles) {
      pushToIndexMap(byGuildWithRoles, binding.match.guildId, binding);
      continue;
    }
    if (binding.match.guildId && !binding.match.roles) {
      pushToIndexMap(byGuild, binding.match.guildId, binding);
      continue;
    }
    if (binding.match.teamId) {
      pushToIndexMap(byTeam, binding.match.teamId, binding);
      continue;
    }
    if (binding.match.accountPattern !== '*') {
      byAccount.push(binding);
      continue;
    }
    byChannel.push(binding);
  }

  return {
    byPeer,
    byPeerWildcard,
    byGuildWithRoles,
    byGuild,
    byTeam,
    byAccount,
    byChannel,
  };
}

function hasGuildConstraint(match: NormalizedBindingMatch): boolean {
  return Boolean(match.guildId);
}

function hasTeamConstraint(match: NormalizedBindingMatch): boolean {
  return Boolean(match.teamId);
}

function hasRolesConstraint(match: NormalizedBindingMatch): boolean {
  return Boolean(match.roles);
}

function matchesBindingScope(match: NormalizedBindingMatch, scope: BindingScope): boolean {
  if (match.peer.state === 'invalid') {
    return false;
  }
  if (match.peer.state === 'valid') {
    if (
      !scope.peer ||
      !peerKindMatches(match.peer.kind, scope.peer.kind) ||
      scope.peer.id !== match.peer.id
    ) {
      return false;
    }
  }
  if (match.peer.state === 'wildcard-kind') {
    if (!scope.peer || !peerKindMatches(match.peer.kind, scope.peer.kind)) {
      return false;
    }
  }
  return routeBindingScopeMatches(match, scope);
}

function deriveLastRoutePolicy(params: {
  sessionKey: string;
  mainSessionKey: string;
}): ResolvedAgentRoute['lastRoutePolicy'] {
  return params.sessionKey === params.mainSessionKey ? 'main' : 'session';
}

function buildAgentSessionKey(params: {
  agentId: string;
  channel: string;
  accountId?: string | null;
  peer?: RoutePeer | null;
  dmScope?: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer';
}): string {
  const channel = normalizeToken(params.channel) || 'unknown';
  const peer = params.peer;
  return buildAgentPeerSessionKey({
    agentId: params.agentId,
    mainKey: DEFAULT_MAIN_KEY,
    channel,
    accountId: params.accountId,
    peerKind: peer?.kind ?? 'direct',
    peerId: peer ? normalizeId(peer.id) || 'unknown' : null,
    dmScope: params.dmScope,
  });
}

export function resolveAgentRoute(input: ResolveAgentRouteInput): ResolvedAgentRoute {
  const channel = normalizeToken(input.channel);
  const accountId = normalizeAccountId(input.accountId);
  const peer = input.peer
    ? {
        kind: (normalizeChatType(input.peer.kind) ?? input.peer.kind) as ChatType,
        id: normalizeId(input.peer.id),
      }
    : null;
  const guildId = normalizeId(input.guildId);
  const teamId = normalizeId(input.teamId);
  const memberRoleIds = input.memberRoleIds ?? [];
  const memberRoleIdSet = new Set(memberRoleIds);
  const dmScope = input.cfg?.session?.dmScope ?? 'main';
  const parentPeer = input.parentPeer
    ? {
        kind: (normalizeChatType(input.parentPeer.kind) ?? input.parentPeer.kind) as ChatType,
        id: normalizeId(input.parentPeer.id),
      }
    : null;

  const bindings = buildEvaluatedBindings(channel, accountId);
  const bindingsIndex = buildEvaluatedBindingsIndex(bindings);

  const choose = (
    agentId: string,
    matchedBy: RouteMatchReason,
  ): ResolvedAgentRoute => {
    const resolvedAgentId = pickFirstExistingAgentId(input.cfg, agentId);
    const sessionKey = buildAgentSessionKey({
      agentId: resolvedAgentId,
      channel,
      accountId,
      peer,
      dmScope,
    });
    const mainSessionKey = buildAgentMainSessionKey({
      agentId: resolvedAgentId,
      mainKey: DEFAULT_MAIN_KEY,
    });
    return {
      agentId: resolvedAgentId,
      channel,
      accountId,
      sessionKey,
      mainSessionKey,
      lastRoutePolicy: deriveLastRoutePolicy({ sessionKey, mainSessionKey }),
      matchedBy,
    };
  };

  const baseScope = {
    guildId,
    teamId,
    memberRoleIds: memberRoleIdSet,
  };

  const tiers: Array<{
    matchedBy: Exclude<RouteMatchReason, 'default'>;
    enabled: boolean;
    scopePeer: RoutePeer | null;
    candidates: EvaluatedBinding[];
    predicate: (candidate: EvaluatedBinding) => boolean;
  }> = [
    {
      matchedBy: 'binding.peer',
      enabled: Boolean(peer),
      scopePeer: peer,
      candidates: collectPeerIndexedBindings(bindingsIndex, peer),
      predicate: (candidate) => candidate.match.peer.state === 'valid',
    },
    {
      matchedBy: 'binding.peer.parent',
      enabled: Boolean(parentPeer && parentPeer.id),
      scopePeer: parentPeer && parentPeer.id ? parentPeer : null,
      candidates: collectPeerIndexedBindings(bindingsIndex, parentPeer),
      predicate: (candidate) => candidate.match.peer.state === 'valid',
    },
    {
      matchedBy: 'binding.peer.wildcard',
      enabled: Boolean(peer),
      scopePeer: peer,
      candidates: bindingsIndex.byPeerWildcard,
      predicate: (candidate) => candidate.match.peer.state === 'wildcard-kind',
    },
    {
      matchedBy: 'binding.guild+roles',
      enabled: Boolean(guildId && memberRoleIds.length > 0),
      scopePeer: peer,
      candidates: guildId ? (bindingsIndex.byGuildWithRoles.get(guildId) ?? []) : [],
      predicate: (candidate) =>
        hasGuildConstraint(candidate.match) && hasRolesConstraint(candidate.match),
    },
    {
      matchedBy: 'binding.guild',
      enabled: Boolean(guildId),
      scopePeer: peer,
      candidates: guildId ? (bindingsIndex.byGuild.get(guildId) ?? []) : [],
      predicate: (candidate) =>
        hasGuildConstraint(candidate.match) && !hasRolesConstraint(candidate.match),
    },
    {
      matchedBy: 'binding.team',
      enabled: Boolean(teamId),
      scopePeer: peer,
      candidates: teamId ? (bindingsIndex.byTeam.get(teamId) ?? []) : [],
      predicate: (candidate) => hasTeamConstraint(candidate.match),
    },
    {
      matchedBy: 'binding.account',
      enabled: true,
      scopePeer: peer,
      candidates: bindingsIndex.byAccount,
      predicate: (candidate) => candidate.match.accountPattern !== '*',
    },
    {
      matchedBy: 'binding.channel',
      enabled: true,
      scopePeer: peer,
      candidates: bindingsIndex.byChannel,
      predicate: (candidate) => candidate.match.accountPattern === '*',
    },
  ];

  for (const tier of tiers) {
    if (!tier.enabled) {
      continue;
    }
    const matched = tier.candidates.find(
      (candidate) =>
        tier.predicate(candidate) &&
        matchesBindingScope(candidate.match, {
          ...baseScope,
          peer: tier.scopePeer,
        }),
    );
    if (matched) {
      logger.debug(
        `[Routing:ResolveRoute] Match found: matchedBy=${tier.matchedBy} agentId=${matched.binding.agentId}`,
      );
      return choose(matched.binding.agentId, tier.matchedBy);
    }
  }

  logger.debug(`[Routing:ResolveRoute] No binding match, using default agent`);
  return choose(resolveDefaultAgentId(input.cfg), 'default');
}
