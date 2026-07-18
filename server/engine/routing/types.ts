export type BindingScope = 'user' | 'channel' | 'team' | 'global';

export type ChatType = 'direct' | 'group' | 'channel';

export interface RouteTarget {
  agentId: string;
  channelId: string;
  accountId: string;
  peerKind?: ChatType;
  peerId?: string;
}

export interface BoundAccount {
  accountId: string;
  agentId: string;
  channelId: string;
  scope: BindingScope;
  peerId?: string;
  peerKind?: ChatType;
  guildId?: string;
  teamId?: string;
  roles?: string[];
  boundAt: number;
  metadata: Record<string, unknown>;
}

export interface RouteResolution {
  ok: boolean;
  target?: RouteTarget;
  sessionKey?: string;
  mainSessionKey?: string;
  matchedBy: RouteMatchReason;
  error?: string;
}

export type RouteMatchReason =
  | 'binding.peer'
  | 'binding.peer.parent'
  | 'binding.peer.wildcard'
  | 'binding.guild+roles'
  | 'binding.guild'
  | 'binding.team'
  | 'binding.account'
  | 'binding.channel'
  | 'default';

export interface RouteBinding {
  id: string;
  agentId: string;
  match: RouteBindingMatch;
  priority?: number;
  enabled?: boolean;
}

export interface RouteBindingMatch {
  channel: string;
  accountId?: string;
  peer?: {
    kind: ChatType;
    id: string;
  };
  guildId?: string;
  teamId?: string;
  roles?: string[];
}

export interface RouteBindingScopeConstraint {
  guildId?: string | null;
  teamId?: string | null;
  roles?: string[] | null;
}

export interface RouteBindingScope {
  guildId?: string | null;
  teamId?: string | null;
  groupSpace?: string | null;
  memberRoleIds?: Iterable<string> | null;
}

export interface NormalizedRouteBindingMatch {
  agentId: string;
  accountId: string;
  channelId: string;
}

export interface ChannelRouteTarget {
  agentId: string;
  channels: string[];
}

export interface RoutePeer {
  kind: ChatType;
  id: string;
}

export interface ResolvedAgentRoute {
  agentId: string;
  channel: string;
  accountId: string;
  sessionKey: string;
  mainSessionKey: string;
  lastRoutePolicy: 'main' | 'session';
  matchedBy: RouteMatchReason;
}
