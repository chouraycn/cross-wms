import { logger } from '../../../logger.js';
import type { AgentContext, ContextPropagationOptions } from './types.js';
import { AgentContextSchema } from './types.js';
import { storeContext, getContext, updateContext, removeContext, getContextSnapshot, getContextHistory } from './context-store.js';

export function createContext(params: {
  agentId: string;
  sessionId: string;
  workspaceDir?: string;
  env?: Record<string, string>;
  metadata?: Record<string, unknown>;
  requestId?: string;
  traceId?: string;
}): AgentContext {
  const context: AgentContext = AgentContextSchema.parse({
    agentId: params.agentId,
    sessionId: params.sessionId,
    workspaceDir: params.workspaceDir,
    env: params.env ?? {},
    memory: {},
    startTime: Date.now(),
    metadata: params.metadata ?? {},
    requestId: params.requestId,
    traceId: params.traceId,
  });

  storeContext(context);
  logger.debug(`[Agents:ContextManager] Created context for ${params.agentId}:${params.sessionId}`);

  return context;
}

export function getOrCreateContext(params: {
  agentId: string;
  sessionId: string;
  workspaceDir?: string;
}): AgentContext {
  const existing = getContext(params.agentId, params.sessionId);
  if (existing) {
    return existing;
  }

  return createContext(params);
}

export function cloneContext(context: AgentContext): AgentContext {
  return {
    ...context,
    env: { ...context.env },
    memory: { ...context.memory },
    metadata: { ...context.metadata },
  };
}

export function mergeContext(base: AgentContext, override: Partial<AgentContext>): AgentContext {
  const merged: AgentContext = {
    ...base,
    ...override,
    env: { ...base.env, ...override.env },
    memory: { ...base.memory, ...override.memory },
    metadata: { ...base.metadata, ...override.metadata },
  };

  storeContext(merged);
  return merged;
}

export function updateContextValue(agentId: string, sessionId: string, key: string, value: unknown): AgentContext | undefined {
  const context = getContext(agentId, sessionId);
  if (!context) return undefined;

  const updated = { ...context };

  if (key.startsWith('env.')) {
    const envKey = key.substring(4);
    updated.env = { ...context.env, [envKey]: String(value) };
  } else if (key.startsWith('memory.')) {
    const memKey = key.substring(7);
    updated.memory = { ...context.memory, [memKey]: value };
  } else if (key.startsWith('metadata.')) {
    const metaKey = key.substring(9);
    updated.metadata = { ...context.metadata, [metaKey]: value };
  } else {
    (updated as Record<string, unknown>)[key] = value;
  }

  storeContext(updated);
  return updated;
}

export function deleteContextValue(agentId: string, sessionId: string, key: string): AgentContext | undefined {
  const context = getContext(agentId, sessionId);
  if (!context) return undefined;

  const updated = { ...context };

  if (key.startsWith('env.')) {
    const envKey = key.substring(4);
    updated.env = { ...context.env };
    delete updated.env[envKey];
  } else if (key.startsWith('memory.')) {
    const memKey = key.substring(7);
    updated.memory = { ...context.memory };
    delete updated.memory[memKey];
  } else if (key.startsWith('metadata.')) {
    const metaKey = key.substring(9);
    updated.metadata = { ...context.metadata };
    delete updated.metadata[metaKey];
  }

  storeContext(updated);
  return updated;
}

export function endContext(agentId: string, sessionId: string): void {
  removeContext(agentId, sessionId);
  logger.debug(`[Agents:ContextManager] Ended context for ${agentId}:${sessionId}`);
}

export function getContextDuration(agentId: string, sessionId: string): number | undefined {
  const context = getContext(agentId, sessionId);
  if (!context || !context.startTime) return undefined;
  return Date.now() - context.startTime;
}

export function getContextDebugInfo(agentId: string, sessionId: string): {
  agentId: string;
  sessionId: string;
  startTime?: number;
  durationMs?: number;
  envCount: number;
  memoryCount: number;
  metadataCount: number;
  workspaceDir?: string;
} {
  const context = getContext(agentId, sessionId);
  if (!context) {
    throw new Error(`Context not found: ${agentId}:${sessionId}`);
  }

  return {
    agentId: context.agentId,
    sessionId: context.sessionId,
    startTime: context.startTime,
    durationMs: context.startTime ? Date.now() - context.startTime : undefined,
    envCount: Object.keys(context.env).length,
    memoryCount: Object.keys(context.memory).length,
    metadataCount: Object.keys(context.metadata).length,
    workspaceDir: context.workspaceDir,
  };
}

logger.debug('[Agents:ContextManager] Module loaded');