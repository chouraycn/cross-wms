import { logger } from '../../logger.js';
import {
  normalizeRouteBindingChannelId,
  resolveNormalizedRouteBindingMatch,
} from './binding-scope.js';
import { normalizeAgentId } from './session-key.js';
import type { RouteBinding } from './types.js';

const bindingsStore = new Map<string, RouteBinding>();
const channelBindingsIndex = new Map<string, string[]>();

export function addBinding(binding: RouteBinding): RouteBinding {
  const id = binding.id || `binding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const normalized: RouteBinding = {
    ...binding,
    id,
    enabled: binding.enabled ?? true,
    priority: binding.priority ?? 0,
  };

  bindingsStore.set(id, normalized);

  const channelId = normalizeRouteBindingChannelId(normalized.match.channel);
  if (channelId) {
    const list = channelBindingsIndex.get(channelId) ?? [];
    if (!list.includes(id)) {
      list.push(id);
    }
    channelBindingsIndex.set(channelId, list);
  }

  logger.debug(`[Routing:Bindings] Added binding ${id} for channel ${normalized.match.channel}`);
  return normalized;
}

export function removeBinding(bindingId: string): boolean {
  const binding = bindingsStore.get(bindingId);
  if (!binding) return false;

  bindingsStore.delete(bindingId);

  const channelId = normalizeRouteBindingChannelId(binding.match.channel);
  if (channelId) {
    const list = channelBindingsIndex.get(channelId);
    if (list) {
      const filtered = list.filter((id) => id !== bindingId);
      if (filtered.length > 0) {
        channelBindingsIndex.set(channelId, filtered);
      } else {
        channelBindingsIndex.delete(channelId);
      }
    }
  }

  logger.debug(`[Routing:Bindings] Removed binding ${bindingId}`);
  return true;
}

export function getBinding(bindingId: string): RouteBinding | undefined {
  return bindingsStore.get(bindingId);
}

export function listBindings(channelId?: string): RouteBinding[] {
  let bindings: RouteBinding[];
  if (channelId) {
    const normalizedChannel = normalizeRouteBindingChannelId(channelId);
    const ids = normalizedChannel ? channelBindingsIndex.get(normalizedChannel) ?? [] : [];
    bindings = ids.map((id) => bindingsStore.get(id)).filter(Boolean) as RouteBinding[];
  } else {
    bindings = Array.from(bindingsStore.values());
  }

  return bindings.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}

export function listBoundAccountIds(channelId: string): string[] {
  const normalizedChannel = normalizeRouteBindingChannelId(channelId);
  if (!normalizedChannel) {
    return [];
  }
  const ids = new Set<string>();
  for (const binding of listBindings(channelId)) {
    const resolved = resolveNormalizedRouteBindingMatch(binding);
    if (!resolved || resolved.channelId !== normalizedChannel) {
      continue;
    }
    ids.add(resolved.accountId);
  }
  return Array.from(ids).sort((a, b) => a.localeCompare(b));
}

export function buildChannelAccountBindings(): Map<string, Map<string, string[]>> {
  const map = new Map<string, Map<string, string[]>>();
  for (const binding of listBindings()) {
    const resolved = resolveNormalizedRouteBindingMatch(binding);
    if (!resolved) {
      continue;
    }
    const byAgent = map.get(resolved.channelId) ?? new Map<string, string[]>();
    const list = byAgent.get(resolved.agentId) ?? [];
    if (!list.includes(resolved.accountId)) {
      list.push(resolved.accountId);
    }
    byAgent.set(resolved.agentId, list);
    map.set(resolved.channelId, byAgent);
  }
  return map;
}

export function resolvePreferredAccountId(params: {
  accountIds: string[];
  defaultAccountId: string;
  boundAccounts: string[];
}): string {
  if (params.boundAccounts.length > 0) {
    return params.boundAccounts[0];
  }
  return params.defaultAccountId;
}

export function resolveDefaultAgentBoundAccountId(
  channelId: string,
  defaultAgentId?: string,
): string | null {
  const normalizedChannel = normalizeRouteBindingChannelId(channelId);
  if (!normalizedChannel) {
    return null;
  }
  const agentId = normalizeAgentId(defaultAgentId);
  for (const binding of listBindings(channelId)) {
    const resolved = resolveNormalizedRouteBindingMatch(binding);
    if (
      !resolved ||
      resolved.channelId !== normalizedChannel ||
      resolved.agentId !== agentId
    ) {
      continue;
    }
    return resolved.accountId;
  }
  return null;
}

export function clearBindings(): void {
  bindingsStore.clear();
  channelBindingsIndex.clear();
  logger.debug('[Routing:Bindings] Cleared all bindings');
}

export function getBindingCount(): number {
  return bindingsStore.size;
}
