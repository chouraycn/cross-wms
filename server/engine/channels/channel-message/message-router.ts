import { logger } from "../../../logger.js";
import type { ChannelMessage } from "../../../channels/message/types.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";

export type RouteCondition =
  | { type: "channel"; channelId: ChannelId }
  | { type: "account"; accountId: AccountId }
  | { type: "kind"; kind: string }
  | { type: "content"; pattern: RegExp }
  | { type: "metadata"; key: string; value: unknown }
  | { type: "custom"; predicate: (message: ChannelMessage) => boolean };

export interface MessageRoute {
  id: string;
  name: string;
  conditions: RouteCondition[];
  handler: (message: ChannelMessage) => Promise<void>;
  priority: number;
  enabled: boolean;
}

interface RouteMatch {
  route: MessageRoute;
  score: number;
}

const routes = new Map<string, MessageRoute>();

export function addRoute(route: MessageRoute): void {
  routes.set(route.id, route);
  logger.debug(`[ChannelMessage:Router] Added route: ${route.id}`);
}

export function removeRoute(routeId: string): boolean {
  const deleted = routes.delete(routeId);
  if (deleted) {
    logger.debug(`[ChannelMessage:Router] Removed route: ${routeId}`);
  }
  return deleted;
}

export function getRoute(routeId: string): MessageRoute | undefined {
  return routes.get(routeId);
}

export function listRoutes(): MessageRoute[] {
  return Array.from(routes.values());
}

export function clearRoutes(): void {
  routes.clear();
  logger.debug(`[ChannelMessage:Router] All routes cleared`);
}

export async function routeMessage(message: ChannelMessage): Promise<MessageRoute[]> {
  const matches: RouteMatch[] = [];

  for (const route of routes.values()) {
    if (!route.enabled) continue;

    const score = evaluateConditions(route.conditions, message);
    if (score > 0) {
      matches.push({ route, score });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  for (const match of matches) {
    try {
      await match.route.handler(message);
      logger.debug(`[ChannelMessage:Router] Message ${message.id} routed to ${match.route.id}`);
    } catch (error) {
      logger.error(`[ChannelMessage:Router] Route handler failed for ${match.route.id}`, { error });
    }
  }

  return matches.map((m) => m.route);
}

export function matchRoute(message: ChannelMessage): MessageRoute | undefined {
  const matches: RouteMatch[] = [];

  for (const route of routes.values()) {
    if (!route.enabled) continue;

    const score = evaluateConditions(route.conditions, message);
    if (score > 0) {
      matches.push({ route, score });
    }
  }

  if (matches.length === 0) return undefined;

  matches.sort((a, b) => b.score - a.score);
  return matches[0].route;
}

function evaluateConditions(conditions: RouteCondition[], message: ChannelMessage): number {
  let score = 0;

  for (const condition of conditions) {
    const matched = evaluateCondition(condition, message);
    if (!matched) {
      return 0;
    }
    score += 1;
  }

  return score;
}

function evaluateCondition(condition: RouteCondition, message: ChannelMessage): boolean {
  switch (condition.type) {
    case "channel":
      return message.channelId === condition.channelId;
    case "account":
      return message.accountId === condition.accountId;
    case "kind":
      return (message.metadata?.kind as string | undefined) === condition.kind;
    case "content":
      return condition.pattern.test(message.content);
    case "metadata":
      return message.metadata?.[condition.key] === condition.value;
    case "custom":
      return condition.predicate(message);
    default:
      return false;
  }
}