import { logger } from '../../../logger.js';
import type { AgentContext, ContextPropagationOptions } from './types.js';
import { getContext } from './context-store.js';

export function serializeContext(context: AgentContext, options?: ContextPropagationOptions): string {
  const defaults: ContextPropagationOptions = {
    includeEnv: true,
    includeMemory: true,
    includeMetadata: true,
    includeWorkspace: true,
  };

  const opts = { ...defaults, ...options };

  const serialized: Record<string, unknown> = {
    agentId: context.agentId,
    sessionId: context.sessionId,
    startTime: context.startTime,
    requestId: context.requestId,
    traceId: context.traceId,
  };

  if (opts.includeWorkspace && context.workspaceDir) {
    serialized.workspaceDir = context.workspaceDir;
  }

  if (opts.includeEnv && Object.keys(context.env).length > 0) {
    serialized.env = context.env;
  }

  if (opts.includeMemory && Object.keys(context.memory).length > 0) {
    serialized.memory = context.memory;
  }

  if (opts.includeMetadata && Object.keys(context.metadata).length > 0) {
    serialized.metadata = context.metadata;
  }

  return JSON.stringify(serialized);
}

export function deserializeContext(serialized: string): AgentContext {
  const data = JSON.parse(serialized);
  
  return {
    agentId: data.agentId,
    sessionId: data.sessionId,
    workspaceDir: data.workspaceDir,
    env: data.env ?? {},
    memory: data.memory ?? {},
    startTime: data.startTime,
    metadata: data.metadata ?? {},
    requestId: data.requestId,
    traceId: data.traceId,
  };
}

export function createContextHeaders(context: AgentContext, options?: ContextPropagationOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'x-agent-id': context.agentId,
    'x-session-id': context.sessionId,
  };

  if (context.requestId) {
    headers['x-request-id'] = context.requestId;
  }

  if (context.traceId) {
    headers['x-trace-id'] = context.traceId;
  }

  if (options?.includeEnv) {
    headers['x-agent-env'] = JSON.stringify(context.env);
  }

  if (options?.includeMetadata) {
    headers['x-agent-metadata'] = JSON.stringify(context.metadata);
  }

  return headers;
}

export function extractContextFromHeaders(headers: Record<string, string>): Partial<AgentContext> {
  const context: Partial<AgentContext> = {};

  if (headers['x-agent-id']) {
    context.agentId = headers['x-agent-id'];
  }

  if (headers['x-session-id']) {
    context.sessionId = headers['x-session-id'];
  }

  if (headers['x-request-id']) {
    context.requestId = headers['x-request-id'];
  }

  if (headers['x-trace-id']) {
    context.traceId = headers['x-trace-id'];
  }

  if (headers['x-agent-env']) {
    try {
      context.env = JSON.parse(headers['x-agent-env']);
    } catch {
      logger.warn('[Agents:ContextPropagation] Failed to parse x-agent-env header');
    }
  }

  if (headers['x-agent-metadata']) {
    try {
      context.metadata = JSON.parse(headers['x-agent-metadata']);
    } catch {
      logger.warn('[Agents:ContextPropagation] Failed to parse x-agent-metadata header');
    }
  }

  return context;
}

export function propagateContext(agentId: string, sessionId: string, targetAgentId: string, targetSessionId: string, options?: ContextPropagationOptions): void {
  const sourceContext = getContext(agentId, sessionId);
  if (!sourceContext) {
    logger.warn(`[Agents:ContextPropagation] Source context not found: ${agentId}:${sessionId}`);
    return;
  }

  const defaults: ContextPropagationOptions = {
    includeEnv: true,
    includeMemory: true,
    includeMetadata: true,
    includeWorkspace: false,
  };

  const opts = { ...defaults, ...options };

  const propagated: Partial<AgentContext> = {
    traceId: sourceContext.traceId,
  };

  if (opts.includeEnv) {
    propagated.env = sourceContext.env;
  }

  if (opts.includeMemory) {
    propagated.memory = sourceContext.memory;
  }

  if (opts.includeMetadata) {
    propagated.metadata = sourceContext.metadata;
  }

  if (opts.includeWorkspace) {
    propagated.workspaceDir = sourceContext.workspaceDir;
  }

  const targetContext = getContext(targetAgentId, targetSessionId);
  if (targetContext) {
    Object.assign(targetContext, propagated);
  }

  logger.debug(`[Agents:ContextPropagation] Propagated context from ${agentId}:${sessionId} to ${targetAgentId}:${targetSessionId}`);
}

export function createContextSnapshot(context: AgentContext): {
  agentId: string;
  sessionId: string;
  env: Record<string, string>;
  memory: Record<string, unknown>;
  metadata: Record<string, unknown>;
  timestamp: number;
} {
  return {
    agentId: context.agentId,
    sessionId: context.sessionId,
    env: { ...context.env },
    memory: { ...context.memory },
    metadata: { ...context.metadata },
    timestamp: Date.now(),
  };
}

logger.debug('[Agents:ContextPropagation] Module loaded');