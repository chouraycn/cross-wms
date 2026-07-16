import { logger } from '../../logger.js';

export interface ChannelMessageRoute {
  id: string;
  channelId: string;
  pattern: string;
  targetAgentId?: string;
  targetSkillId?: string;
  priority: number;
  enabled: boolean;
  metadata?: Record<string, unknown>;
}

const routeStore = new Map<string, ChannelMessageRoute[]>();

export function addRoute(channelId: string, route: ChannelMessageRoute): void {
  const list = routeStore.get(channelId) ?? [];
  list.push(route);
  list.sort((a, b) => b.priority - a.priority);
  routeStore.set(channelId, list);
  logger.debug(`[Channels:Routing] Added route ${route.id} to ${channelId}`);
}

export function removeRoute(channelId: string, routeId: string): boolean {
  const list = routeStore.get(channelId);
  if (!list) return false;
  const filtered = list.filter((r) => r.id !== routeId);
  routeStore.set(channelId, filtered);
  return filtered.length !== list.length;
}

export function matchRoute(channelId: string, content: string): ChannelMessageRoute | undefined {
  const list = routeStore.get(channelId) ?? [];
  for (const route of list) {
    if (!route.enabled) continue;
    try {
      const regex = new RegExp(route.pattern);
      if (regex.test(content)) return route;
    } catch {
      if (content.includes(route.pattern)) return route;
    }
  }
  return undefined;
}

export function listRoutes(channelId?: string): ChannelMessageRoute[] {
  if (channelId) return [...(routeStore.get(channelId) ?? [])];
  const all: ChannelMessageRoute[] = [];
  for (const list of routeStore.values()) {
    all.push(...list);
  }
  return all;
}

export function clearRoutes(channelId: string): void {
  routeStore.delete(channelId);
}
