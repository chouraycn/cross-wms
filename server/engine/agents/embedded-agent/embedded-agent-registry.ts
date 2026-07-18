import { z } from 'zod';
import { logger } from '../../../logger.js';
import type { EmbeddedAgentConfig } from './types.js';
import { EmbeddedAgentConfigSchema } from './types.js';

const agentStore = new Map<string, EmbeddedAgentConfig>();
const tagIndex = new Map<string, Set<string>>();

export function registerEmbeddedAgent(config: EmbeddedAgentConfig): void {
  const result = EmbeddedAgentConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid embedded agent config: ${result.error.message}`);
  }

  agentStore.set(config.id, result.data);

  for (const tag of config.tags) {
    if (!tagIndex.has(tag)) {
      tagIndex.set(tag, new Set());
    }
    tagIndex.get(tag)!.add(config.id);
  }

  logger.debug(`[Agents:EmbeddedAgentRegistry] Registered agent: ${config.id}`);
}

export function unregisterEmbeddedAgent(agentId: string): boolean {
  const config = agentStore.get(agentId);
  if (!config) return false;

  agentStore.delete(agentId);

  for (const tag of config.tags) {
    const tagSet = tagIndex.get(tag);
    if (tagSet) {
      tagSet.delete(agentId);
      if (tagSet.size === 0) {
        tagIndex.delete(tag);
      }
    }
  }

  logger.debug(`[Agents:EmbeddedAgentRegistry] Unregistered agent: ${agentId}`);
  return true;
}

export function getEmbeddedAgent(agentId: string): EmbeddedAgentConfig | undefined {
  return agentStore.get(agentId);
}

export function listEmbeddedAgents(options?: {
  enabledOnly?: boolean;
  tags?: string[];
}): EmbeddedAgentConfig[] {
  let agents = Array.from(agentStore.values());

  if (options?.enabledOnly) {
    agents = agents.filter(a => a.enabled);
  }

  if (options?.tags && options.tags.length > 0) {
    agents = agents.filter(a => options!.tags!.some(t => a.tags.includes(t)));
  }

  return agents;
}

export function embeddedAgentExists(agentId: string): boolean {
  return agentStore.has(agentId);
}

export function updateEmbeddedAgent(agentId: string, updates: Partial<EmbeddedAgentConfig>): EmbeddedAgentConfig | undefined {
  const existing = agentStore.get(agentId);
  if (!existing) return undefined;

  const updated = { ...existing, ...updates, id: agentId };
  const result = EmbeddedAgentConfigSchema.safeParse(updated);
  if (!result.success) {
    throw new Error(`Invalid update: ${result.error.message}`);
  }

  agentStore.set(agentId, result.data);
  logger.debug(`[Agents:EmbeddedAgentRegistry] Updated agent: ${agentId}`);
  return result.data;
}

export function clearEmbeddedAgents(): void {
  agentStore.clear();
  tagIndex.clear();
  logger.debug('[Agents:EmbeddedAgentRegistry] Cleared all agents');
}

logger.debug('[Agents:EmbeddedAgentRegistry] Module loaded');