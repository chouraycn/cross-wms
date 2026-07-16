import { logger } from '../../logger.js';

export interface AgentContext {
  agentId: string;
  sessionId: string;
  workspaceDir?: string;
  env?: Record<string, string>;
  memory?: Record<string, unknown>;
  startTime?: number;
  metadata?: Record<string, unknown>;
}

export function createAgentContext(params: {
  agentId: string;
  sessionId: string;
  workspaceDir?: string;
}): AgentContext {
  return {
    agentId: params.agentId,
    sessionId: params.sessionId,
    workspaceDir: params.workspaceDir,
    env: {},
    memory: {},
    startTime: Date.now(),
    metadata: {},
  };
}

export function updateAgentContext(
  context: AgentContext,
  updates: Partial<AgentContext>,
): AgentContext {
  return { ...context, ...updates };
}

export function cloneAgentContext(context: AgentContext): AgentContext {
  return {
    ...context,
    env: { ...context.env },
    memory: { ...context.memory },
    metadata: { ...context.metadata },
  };
}

export function logAgentContext(context: AgentContext): void {
  logger.debug(`[Agents:Context] agent=${context.agentId}, session=${context.sessionId}`);
}
