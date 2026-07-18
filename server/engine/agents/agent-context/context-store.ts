import { logger } from '../../../logger.js';
import type { AgentContext, ContextSnapshot } from './types.js';

const contextStore = new Map<string, AgentContext>();
const snapshotStore = new Map<string, ContextSnapshot[]>();

export function storeContext(context: AgentContext): void {
  const key = `${context.agentId}:${context.sessionId}`;
  contextStore.set(key, context);

  const snapshots = snapshotStore.get(key) ?? [];
  snapshots.push({
    context: { ...context },
    timestamp: Date.now(),
    version: snapshots.length + 1,
  });

  if (snapshots.length > 50) {
    snapshotStore.set(key, snapshots.slice(-50));
  } else {
    snapshotStore.set(key, snapshots);
  }

  logger.debug(`[Agents:ContextStore] Stored context for ${key}`);
}

export function getContext(agentId: string, sessionId: string): AgentContext | undefined {
  const key = `${agentId}:${sessionId}`;
  return contextStore.get(key);
}

export function removeContext(agentId: string, sessionId: string): boolean {
  const key = `${agentId}:${sessionId}`;
  const existed = contextStore.has(key);
  
  if (existed) {
    contextStore.delete(key);
    snapshotStore.delete(key);
    logger.debug(`[Agents:ContextStore] Removed context for ${key}`);
  }

  return existed;
}

export function updateContext(agentId: string, sessionId: string, updates: Partial<AgentContext>): AgentContext | undefined {
  const key = `${agentId}:${sessionId}`;
  const existing = contextStore.get(key);
  
  if (!existing) return undefined;

  const updated: AgentContext = {
    ...existing,
    ...updates,
    agentId,
    sessionId,
  };

  storeContext(updated);
  return updated;
}

export function getContextSnapshot(agentId: string, sessionId: string, version?: number): ContextSnapshot | undefined {
  const key = `${agentId}:${sessionId}`;
  const snapshots = snapshotStore.get(key);
  
  if (!snapshots || snapshots.length === 0) return undefined;

  if (version) {
    return snapshots.find(s => s.version === version);
  }

  return snapshots[snapshots.length - 1];
}

export function getContextHistory(agentId: string, sessionId: string, limit?: number): ContextSnapshot[] {
  const key = `${agentId}:${sessionId}`;
  const snapshots = snapshotStore.get(key) ?? [];
  
  if (limit) {
    return snapshots.slice(-limit);
  }

  return snapshots;
}

export function clearAllContexts(): void {
  contextStore.clear();
  snapshotStore.clear();
  logger.debug('[Agents:ContextStore] Cleared all contexts');
}

export function listActiveContexts(): string[] {
  return Array.from(contextStore.keys());
}

export function countActiveContexts(): number {
  return contextStore.size;
}

logger.debug('[Agents:ContextStore] Module loaded');