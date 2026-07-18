export type {
  BindingScope,
  ChatType,
  RouteTarget,
  BoundAccount,
  RouteResolution,
  RouteMatchReason,
  RouteBinding,
  RouteBindingMatch,
  RouteBindingScopeConstraint,
  RouteBindingScope,
  NormalizedRouteBindingMatch,
  ChannelRouteTarget,
  RoutePeer,
  ResolvedAgentRoute,
} from './types.js';

export {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  normalizeOptionalAccountId,
  isValidAccountId,
} from './account-id.js';

export {
  DEFAULT_AGENT_ID,
  DEFAULT_MAIN_KEY,
  normalizeAgentId,
  normalizeOptionalAgentId,
  isValidAgentId,
  normalizeMainKey,
  buildAgentMainSessionKey,
  buildAgentPeerSessionKey,
  parseAgentSessionKey,
  resolveAgentIdFromSessionKey,
  classifySessionKeyShape,
  buildGroupHistoryKey,
  resolveThreadSessionKeys,
} from './session-key.js';

export type { SessionKeyShape } from './session-key.js';

export { peerKindMatches, normalizeChatType } from './peer-kind-match.js';

export {
  normalizeRouteBindingId,
  normalizeRouteBindingRoles,
  normalizeRouteBindingChannelId,
  resolveNormalizedRouteBindingMatch,
  routeBindingScopeMatches,
} from './binding-scope.js';

export {
  addBinding,
  removeBinding,
  getBinding,
  listBindings,
  listBoundAccountIds,
  buildChannelAccountBindings,
  resolvePreferredAccountId,
  resolveDefaultAgentBoundAccountId,
  clearBindings,
  getBindingCount,
} from './bindings.js';

export {
  resolveAccountEntry,
  resolveNormalizedAccountEntry,
  listAccountIds,
} from './account-lookup.js';

export { collectChannelRouteTargets } from './channel-route-targets.js';
export type { ChannelConfig } from './channel-route-targets.js';

export { resolveFirstBoundAccountId } from './bound-account-read.js';

export {
  formatChannelAccountsDefaultPath,
  formatSetExplicitDefaultInstruction,
  formatSetExplicitDefaultToConfiguredInstruction,
  formatDefaultAccountWarning,
} from './default-account-warnings.js';

export { resolveAgentRoute } from './resolve-route.js';
export type { ResolveAgentRouteInput } from './resolve-route.js';
