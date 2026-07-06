import { logger } from '../logger.js';
import type { AgentIdentityConfig } from './agentIdentity.js';
import type { LaneTask } from './executionLanes.js';

export type AgentExecutionStatus = 'idle' | 'running' | 'completed' | 'failed' | 'timeout' | 'cancelled';

export interface AgentExecutionContext {
  executionId: string;
  agentId: string;
  sessionId?: string;
  startTime: number;
  endTime?: number;
  status: AgentExecutionStatus;
  input?: string;
  output?: string;
  error?: string;
  laneTask?: LaneTask;
  timeoutMs: number;
  maxConcurrent: number;
}

export interface AgentExecutionOptions {
  timeoutMs?: number;
  maxConcurrent?: number;
  sessionId?: string;
  lane?: string;
  priority?: number;
}

export interface AgentExecutionResult {
  executionId: string;
  status: AgentExecutionStatus;
  output?: string;
  error?: string;
  durationMs: number;
}

const DEFAULT_AGENT_TIMEOUT_MS = 120_000;

class AgentExecutionManager {
  private executions: Map<string, AgentExecutionContext> = new Map();
  private agentActiveCount: Map<string, number> = new Map();
  private timeoutTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  createExecution(
    agentId: string,
    agentConfig: AgentIdentityConfig,
    input?: string,
    options?: AgentExecutionOptions,
  ): AgentExecutionContext {
    const executionId = `${agentId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timeoutMs = options?.timeoutMs ?? agentConfig.maxConcurrentTasks ?? DEFAULT_AGENT_TIMEOUT_MS;
    const maxConcurrent = options?.maxConcurrent ?? agentConfig.maxConcurrentTasks ?? 3;

    const context: AgentExecutionContext = {
      executionId,
      agentId,
      sessionId: options?.sessionId,
      startTime: Date.now(),
      status: 'idle',
      input,
      timeoutMs,
      maxConcurrent,
    };

    this.executions.set(executionId, context);
    return context;
  }

  startExecution(executionId: string): boolean {
    const context = this.executions.get(executionId);
    if (!context || context.status !== 'idle') {
      return false;
    }

    const currentCount = this.agentActiveCount.get(context.agentId) ?? 0;
    if (currentCount >= context.maxConcurrent) {
      logger.warn(`[AgentExecution] Agent ${context.agentId} reached max concurrent: ${context.maxConcurrent}`);
      return false;
    }

    context.status = 'running';
    this.agentActiveCount.set(context.agentId, currentCount + 1);

    if (context.timeoutMs > 0) {
      const timer = setTimeout(() => {
        this.handleTimeout(executionId);
      }, context.timeoutMs);
      this.timeoutTimers.set(executionId, timer);
    }

    logger.debug(`[AgentExecution] Started execution: ${executionId}`);
    return true;
  }

  completeExecution(executionId: string, output?: string): void {
    const context = this.executions.get(executionId);
    if (!context) return;

    this.cancelTimer(executionId);

    context.status = 'completed';
    context.endTime = Date.now();
    context.output = output;

    this.decrementActiveCount(context.agentId);

    logger.debug(`[AgentExecution] Completed execution: ${executionId}`);
  }

  failExecution(executionId: string, error: string): void {
    const context = this.executions.get(executionId);
    if (!context) return;

    this.cancelTimer(executionId);

    context.status = 'failed';
    context.endTime = Date.now();
    context.error = error;

    this.decrementActiveCount(context.agentId);

    logger.error(`[AgentExecution] Failed execution: ${executionId} - ${error}`);
  }

  cancelExecution(executionId: string): boolean {
    const context = this.executions.get(executionId);
    if (!context) return false;

    this.cancelTimer(executionId);

    if (context.status === 'running') {
      context.status = 'cancelled';
      context.endTime = Date.now();
      this.decrementActiveCount(context.agentId);
    }

    logger.debug(`[AgentExecution] Cancelled execution: ${executionId}`);
    return true;
  }

  private handleTimeout(executionId: string): void {
    const context = this.executions.get(executionId);
    if (!context) return;

    context.status = 'timeout';
    context.endTime = Date.now();
    context.error = `Execution timed out after ${context.timeoutMs}ms`;

    this.decrementActiveCount(context.agentId);
    this.timeoutTimers.delete(executionId);

    logger.warn(`[AgentExecution] Timeout: ${executionId} (${context.timeoutMs}ms)`);
  }

  private cancelTimer(executionId: string): void {
    const timer = this.timeoutTimers.get(executionId);
    if (timer) {
      clearTimeout(timer);
      this.timeoutTimers.delete(executionId);
    }
  }

  private decrementActiveCount(agentId: string): void {
    const current = this.agentActiveCount.get(agentId) ?? 0;
    if (current > 0) {
      this.agentActiveCount.set(agentId, current - 1);
    }
  }

  getExecution(executionId: string): AgentExecutionContext | undefined {
    return this.executions.get(executionId);
  }

  getActiveExecutions(agentId?: string): AgentExecutionContext[] {
    return Array.from(this.executions.values()).filter((ctx) => {
      if (agentId && ctx.agentId !== agentId) return false;
      return ctx.status === 'running';
    });
  }

  getAgentActiveCount(agentId: string): number {
    return this.agentActiveCount.get(agentId) ?? 0;
  }

  isAgentAvailable(agentId: string, maxConcurrent: number): boolean {
    const current = this.agentActiveCount.get(agentId) ?? 0;
    return current < maxConcurrent;
  }

  getStats(agentId?: string): {
    total: number;
    running: number;
    completed: number;
    failed: number;
    timeout: number;
    cancelled: number;
    activeCount: number;
  } {
    let total = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    let timeout = 0;
    let cancelled = 0;
    let activeCount = 0;

    for (const ctx of this.executions.values()) {
      if (agentId && ctx.agentId !== agentId) continue;

      total++;
      switch (ctx.status) {
        case 'running':
          running++;
          break;
        case 'completed':
          completed++;
          break;
        case 'failed':
          failed++;
          break;
        case 'timeout':
          timeout++;
          break;
        case 'cancelled':
          cancelled++;
          break;
      }
    }

    if (agentId) {
      activeCount = this.getAgentActiveCount(agentId);
    }

    return { total, running, completed, failed, timeout, cancelled, activeCount };
  }

  cleanup(executionId: string): void {
    this.cancelTimer(executionId);
    this.executions.delete(executionId);
  }

  cleanupBySession(sessionId: string): void {
    for (const [id, ctx] of this.executions) {
      if (ctx.sessionId === sessionId) {
        this.cancelExecution(id);
        this.executions.delete(id);
      }
    }
  }

  clear(): void {
    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer);
    }
    this.executions.clear();
    this.agentActiveCount.clear();
    this.timeoutTimers.clear();
  }
}

export const agentExecutionManager = new AgentExecutionManager();

export function createAgentExecution(
  agentId: string,
  agentConfig: AgentIdentityConfig,
  input?: string,
  options?: AgentExecutionOptions,
): AgentExecutionContext {
  return agentExecutionManager.createExecution(agentId, agentConfig, input, options);
}

export function startAgentExecution(executionId: string): boolean {
  return agentExecutionManager.startExecution(executionId);
}

export function completeAgentExecution(executionId: string, output?: string): void {
  agentExecutionManager.completeExecution(executionId, output);
}

export function failAgentExecution(executionId: string, error: string): void {
  agentExecutionManager.failExecution(executionId, error);
}

export function cancelAgentExecution(executionId: string): boolean {
  return agentExecutionManager.cancelExecution(executionId);
}

export function getAgentExecution(executionId: string): AgentExecutionContext | undefined {
  return agentExecutionManager.getExecution(executionId);
}

export type { AgentExecutionManager };
