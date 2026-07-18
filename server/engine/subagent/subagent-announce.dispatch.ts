/**
 * Subagent Announce Dispatch — 公告分发
 *
 * 管理公告的分发策略。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { listActiveSubagents } from './subagent-registry.state.js';
import { deliverAnnouncement, type DeliveryTarget, type DeliveryResult } from './subagent-announce.delivery.js';

export type DispatchStrategy = 'direct' | 'fanout' | 'hierarchical' | 'topic';

export interface DispatchOptions {
  strategy?: DispatchStrategy;
  topic?: string;
  maxDepth?: number;
  includeSelf?: boolean;
}

export interface DispatchResult {
  success: boolean;
  targets: DeliveryTarget[];
  delivery: DeliveryResult;
}

const DEFAULT_MAX_DEPTH = 5;

export function dispatchAnnouncement(
  instanceId: string,
  announcement: unknown,
  options: DispatchOptions = {},
): DispatchResult {
  const strategy = options.strategy ?? 'direct';
  const targets = resolveTargets(instanceId, strategy, options);

  const delivery = deliverAnnouncement(instanceId, announcement, targets);

  return {
    success: delivery.success,
    targets,
    delivery,
  };
}

function resolveTargets(
  instanceId: string,
  strategy: DispatchStrategy,
  options: DispatchOptions,
): DeliveryTarget[] {
  const instance = listActiveSubagents().find((i) => i.id === instanceId);
  if (!instance) {
    return [];
  }

  switch (strategy) {
    case 'direct':
      return resolveDirectTargets(instance);

    case 'fanout':
      return resolveFanoutTargets(instance, options);

    case 'hierarchical':
      return resolveHierarchicalTargets(instance, options);

    case 'topic':
      return resolveTopicTargets(instance, options);

    default:
      return resolveDirectTargets(instance);
  }
}

function resolveDirectTargets(instance: SubagentInstance): DeliveryTarget[] {
  const targets: DeliveryTarget[] = [];

  if (instance.parentSessionKey) {
    targets.push({ id: instance.parentSessionKey, type: 'thread' });
  }

  return targets;
}

function resolveFanoutTargets(
  instance: SubagentInstance,
  options: DispatchOptions,
): DeliveryTarget[] {
  const allInstances = listActiveSubagents();
  const targets: DeliveryTarget[] = [];

  for (const inst of allInstances) {
    if (!options.includeSelf && inst.id === instance.id) {
      continue;
    }
    targets.push({ id: inst.id, type: 'instance' });
  }

  return targets;
}

function resolveHierarchicalTargets(
  instance: SubagentInstance,
  options: DispatchOptions,
): DeliveryTarget[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const allInstances = listActiveSubagents();
  const targets: DeliveryTarget[] = [];

  const findDescendants = (parentSessionKey: string, depth: number): void => {
    if (depth >= maxDepth) return;

    const children = allInstances.filter((i) => i.parentSessionKey === parentSessionKey);

    for (const child of children) {
      targets.push({ id: child.id, type: 'instance' });
      findDescendants(child.sessionKey, depth + 1);
    }
  };

  if (instance.sessionKey) {
    findDescendants(instance.sessionKey, 0);
  }

  if (instance.parentSessionKey) {
    targets.push({ id: instance.parentSessionKey, type: 'thread' });
  }

  return targets;
}

function resolveTopicTargets(
  instance: SubagentInstance,
  options: DispatchOptions,
): DeliveryTarget[] {
  const topic = options.topic ?? '';
  const allInstances = listActiveSubagents();
  const targets: DeliveryTarget[] = [];

  for (const inst of allInstances) {
    if (!options.includeSelf && inst.id === instance.id) {
      continue;
    }

    const instTopics = (inst.metadata?.topics as string[]) ?? [];
    if (instTopics.includes(topic)) {
      targets.push({ id: inst.id, type: 'instance' });
    }
  }

  return targets;
}

export function subscribeToTopic(instanceId: string, topic: string): boolean {
  const instance = listActiveSubagents().find((i) => i.id === instanceId);
  if (!instance) return false;

  if (!instance.metadata) {
    instance.metadata = {};
  }
  const topics = instance.metadata.topics as string[] | undefined;
  if (!topics) {
    (instance.metadata.topics as string[]) = [];
  }

  const currentTopics = instance.metadata.topics as string[];
  if (!currentTopics.includes(topic)) {
    currentTopics.push(topic);
    logger.debug(`[SubagentAnnounceDispatch] Instance ${instanceId} subscribed to topic: ${topic}`);
  }

  return true;
}

export function unsubscribeFromTopic(instanceId: string, topic: string): boolean {
  const instance = listActiveSubagents().find((i) => i.id === instanceId);
  if (!instance) return false;

  const topics = instance.metadata?.topics as string[] | undefined;
  if (!topics) return true;

  const index = topics.indexOf(topic);
  if (index > -1) {
    topics.splice(index, 1);
    logger.debug(`[SubagentAnnounceDispatch] Instance ${instanceId} unsubscribed from topic: ${topic}`);
    return true;
  }

  return false;
}

export function getSubscribedTopics(instanceId: string): string[] {
  const instance = listActiveSubagents().find((i) => i.id === instanceId);
  return (instance?.metadata?.topics as string[]) ?? [];
}