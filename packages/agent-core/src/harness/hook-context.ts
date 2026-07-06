import type { AgentEvent } from '../types';

export interface HookContext {
  sessionId: string;
  runId: string;
  agentId: string;
  timestamp: number;
  user?: {
    id: string;
    role?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface HookExecutionContext extends HookContext {
  events: AgentEvent[];
  toolCalls: Array<{ toolName: string; args: Record<string, unknown>; result?: string; error?: string }>;
  currentIteration: number;
  maxIterations: number;
}

export interface HookHandler<T = unknown> {
  (ctx: HookExecutionContext): Promise<T>;
}

export class HookContextFactory {
  create(sessionId: string, runId: string, agentId: string): HookContext {
    return {
      sessionId,
      runId,
      agentId,
      timestamp: Date.now(),
    };
  }

  createExecution(sessionId: string, runId: string, agentId: string, currentIteration: number, maxIterations: number): HookExecutionContext {
    return {
      ...this.create(sessionId, runId, agentId),
      events: [],
      toolCalls: [],
      currentIteration,
      maxIterations,
    };
  }

  addEvent(ctx: HookExecutionContext, event: AgentEvent): void {
    ctx.events.push(event);
  }

  addToolCall(ctx: HookExecutionContext, toolName: string, args: Record<string, unknown>, result?: string, error?: string): void {
    ctx.toolCalls.push({ toolName, args, result, error });
  }
}