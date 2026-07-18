/**
 * Subagent Announce Origin — 公告来源
 *
 * 管理公告的来源追踪。
 */

import { logger } from '../../logger.js';
import type { SubagentInstance } from '../subagentRegistry.js';
import { getActiveSubagent, listActiveSubagents } from './subagent-registry.state.js';

export type OriginType = 'direct' | 'nested' | 'inherited' | 'external';

export interface OriginInfo {
  type: OriginType;
  sourceId: string;
  sourceType: 'instance' | 'thread' | 'system';
  chain: OriginChain[];
  timestamp: number;
}

export interface OriginChain {
  instanceId: string;
  sessionKey: string;
  role: 'originator' | 'forwarder' | 'receiver';
  timestamp: number;
}

const originTracking = new Map<string, OriginInfo>();

export function trackOrigin(
  instanceId: string,
  sourceId: string,
  sourceType: 'instance' | 'thread' | 'system',
  type: OriginType = 'direct',
): OriginInfo {
  const instance = getActiveSubagent(instanceId);
  if (!instance) {
    return {
      type,
      sourceId,
      sourceType,
      chain: [],
      timestamp: Date.now(),
    };
  }

  const chain: OriginChain[] = [
    {
      instanceId,
      sessionKey: instance.sessionKey,
      role: 'originator',
      timestamp: Date.now(),
    },
  ];

  if (type === 'nested' || type === 'inherited') {
    buildOriginChain(instance, chain);
  }

  const origin: OriginInfo = {
    type,
    sourceId,
    sourceType,
    chain,
    timestamp: Date.now(),
  };

  originTracking.set(instanceId, origin);

  logger.debug(`[SubagentAnnounceOrigin] Tracked origin for ${instanceId}: ${type}`);

  return origin;
}

function buildOriginChain(instance: SubagentInstance, chain: OriginChain[]): void {
  if (!instance.parentSessionKey) return;

  const parent = listActiveSubagents().find((i) => i.sessionKey === instance.parentSessionKey);
  if (!parent) return;

  chain.push({
    instanceId: parent.id,
    sessionKey: parent.sessionKey,
    role: 'forwarder',
    timestamp: Date.now(),
  });

  buildOriginChain(parent, chain);
}

export function getOrigin(instanceId: string): OriginInfo | undefined {
  return originTracking.get(instanceId);
}

export function isOriginTrusted(instanceId: string): boolean {
  const origin = originTracking.get(instanceId);
  if (!origin) return false;

  for (const link of origin.chain) {
    const inst = getActiveSubagent(link.instanceId);
    if (!inst?.metadata?.trusted) {
      return false;
    }
  }

  return true;
}

export function validateOriginChain(instanceId: string, maxDepth: number = 5): boolean {
  const origin = originTracking.get(instanceId);
  if (!origin) return false;

  return origin.chain.length <= maxDepth;
}

export function clearOrigin(instanceId: string): void {
  originTracking.delete(instanceId);
}

export function getOriginStats(): {
  total: number;
  direct: number;
  nested: number;
  inherited: number;
  external: number;
} {
  const stats: {
    total: number;
    direct: number;
    nested: number;
    inherited: number;
    external: number;
  } = {
    total: originTracking.size,
    direct: 0,
    nested: 0,
    inherited: 0,
    external: 0,
  };

  for (const origin of originTracking.values()) {
    switch (origin.type) {
      case 'direct':
        stats.direct++;
        break;
      case 'nested':
        stats.nested++;
        break;
      case 'inherited':
        stats.inherited++;
        break;
      case 'external':
        stats.external++;
        break;
    }
  }

  return stats;
}