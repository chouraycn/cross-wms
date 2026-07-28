// @ts-nocheck
// Routing binding helpers resolve configured channel and agent route bindings.
import { resolveDefaultAgentId } from "../agents/agent-scope.js";
import { listRouteBindings } from "../config/bindings.js";
import type { AgentRouteBinding } from "../config/types.agents.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  normalizeRouteBindingChannelId,
  resolveNormalizedRouteBindingMatch,
} from "./binding-scope.js";
import { normalizeAgentId } from "./session-key.js";

// ---- In-memory binding store for imperative API ----

type InMemoryBinding = {
  id: string;
  agentId: string;
  match: {
    channel: string;
    accountId: string;
    peer?: { kind: string; id: string };
    guildId?: string;
    teamId?: string;
    roles?: string[];
  };
  session?: { dmScope?: string };
};

const inMemoryBindings = new Map<string, InMemoryBinding>();

export function addBinding(binding: InMemoryBinding): InMemoryBinding {
  inMemoryBindings.set(binding.id, binding);
  return binding;
}

export function removeBinding(id: string): boolean {
  return inMemoryBindings.delete(id);
}

export function getBinding(id: string): InMemoryBinding | undefined {
  return inMemoryBindings.get(id);
}

export function clearBindings(): void {
  inMemoryBindings.clear();
}

export function getBindingCount(): number {
  return inMemoryBindings.size;
}

// ---- Config-based binding helpers ----

export function listBindings(cfg?: OpenClawConfig | string): AgentRouteBinding[] | InMemoryBinding[] {
  if (typeof cfg === "string" || !cfg) {
    // When called with a channel string (filter), return in-memory bindings filtered by channel
    const channel = cfg as string;
    const all = Array.from(inMemoryBindings.values());
    if (channel) {
      return all.filter((b) => b.match.channel === channel);
    }
    return all;
  }
  return listRouteBindings(cfg);
}

export function listBoundAccountIds(cfg: OpenClawConfig | string, channelId?: string): string[] {
  const normalizedChannel = normalizeRouteBindingChannelId(channelId ?? (cfg as string)) || (cfg as string);
  const isConfig = typeof cfg === "object" && cfg !== null;
  const bindings = isConfig ? listRouteBindings(cfg as OpenClawConfig) : Array.from(inMemoryBindings.values());
  const targetChannel = isConfig ? normalizedChannel : (cfg as string);
  if (!targetChannel) {
    return [];
  }
  const ids = new Set<string>();
  for (const binding of bindings) {
    const resolved = resolveNormalizedRouteBindingMatch(binding as any);
    if (!resolved || resolved.channelId !== targetChannel) {
      continue;
    }
    ids.add(resolved.accountId);
  }
  return Array.from(ids).toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultAgentBoundAccountId(
  cfg: OpenClawConfig,
  channelId: string,
): string | null {
  const normalizedChannel = normalizeRouteBindingChannelId(channelId);
  if (!normalizedChannel) {
    return null;
  }
  const defaultAgentId = normalizeAgentId(resolveDefaultAgentId(cfg));
  for (const binding of listRouteBindings(cfg)) {
    const resolved = resolveNormalizedRouteBindingMatch(binding);
    if (
      !resolved ||
      resolved.channelId !== normalizedChannel ||
      resolved.agentId !== defaultAgentId
    ) {
      continue;
    }
    return resolved.accountId;
  }
  return null;
}

export function buildChannelAccountBindings(cfg?: OpenClawConfig): Map<string, Map<string, string[]>> {
  const map = new Map<string, Map<string, string[]>>();
  const bindings = cfg ? listRouteBindings(cfg) : Array.from(inMemoryBindings.values());
  for (const binding of bindings) {
    const resolved = resolveNormalizedRouteBindingMatch(binding as any);
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
