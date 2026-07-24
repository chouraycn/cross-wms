import { logger } from '../../logger.js';
import type { AgentLifecycleState, AgentLifecycleEvent } from './lifecycle.js';
import { VALID_TRANSITIONS } from './lifecycle.js';

export interface AgentLifecycleManagerOptions {
  maxHistoryLength?: number;
  autoCleanupAfterDestroy?: boolean;
  cleanupDelayMs?: number;
}

interface AgentLifecycleEntry {
  state: AgentLifecycleState;
  history: AgentLifecycleEvent[];
  cleanupTimer?: NodeJS.Timeout;
}

export class AgentLifecycleManager {
  private entries = new Map<string, AgentLifecycleEntry>();
  private maxHistoryLength: number;
  private autoCleanupAfterDestroy: boolean;
  private cleanupDelayMs: number;

  constructor(options?: AgentLifecycleManagerOptions) {
    this.maxHistoryLength = options?.maxHistoryLength ?? 100;
    this.autoCleanupAfterDestroy = options?.autoCleanupAfterDestroy ?? true;
    this.cleanupDelayMs = options?.cleanupDelayMs ?? 30000;
  }

  getState(agentId: string): AgentLifecycleState {
    return this.entries.get(agentId)?.state ?? 'created';
  }

  setState(
    agentId: string,
    next: AgentLifecycleState,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): boolean {
    const entry = this.entries.get(agentId);
    const current = entry?.state ?? 'created';
    const allowed = VALID_TRANSITIONS[current];

    if (!allowed.includes(next)) {
      logger.warn(`[AgentLifecycleManager] Invalid transition for ${agentId}: ${current} -> ${next}`);
      return false;
    }

    if (!entry) {
      this.entries.set(agentId, {
        state: next,
        history: [],
      });
    } else {
      entry.state = next;
    }

    const event: AgentLifecycleEvent = {
      agentId,
      from: current,
      to: next,
      timestamp: Date.now(),
      reason,
      metadata,
    };

    const targetEntry = this.entries.get(agentId)!;
    targetEntry.history.push(event);
    if (targetEntry.history.length > this.maxHistoryLength) {
      targetEntry.history.shift();
    }

    logger.debug(`[AgentLifecycleManager] ${agentId}: ${current} -> ${next}${reason ? ` (${reason})` : ''}`);

    if (next === 'destroyed' && this.autoCleanupAfterDestroy) {
      targetEntry.cleanupTimer = setTimeout(() => {
        this.clear(agentId);
      }, this.cleanupDelayMs);
    }

    return true;
  }

  getHistory(agentId: string): AgentLifecycleEvent[] {
    return [...(this.entries.get(agentId)?.history ?? [])];
  }

  canTransition(from: AgentLifecycleState, to: AgentLifecycleState): boolean {
    return VALID_TRANSITIONS[from].includes(to);
  }

  isTerminalState(state: AgentLifecycleState): boolean {
    return state === 'destroyed' || state === 'completed' || state === 'failed' || state === 'aborted';
  }

  isActiveState(state: AgentLifecycleState): boolean {
    return state === 'running' || state === 'paused';
  }

  clear(agentId: string): void {
    const entry = this.entries.get(agentId);
    if (entry?.cleanupTimer) {
      clearTimeout(entry.cleanupTimer);
    }
    this.entries.delete(agentId);
    logger.debug(`[AgentLifecycleManager] Cleared lifecycle for ${agentId}`);
  }

  getActiveAgents(): string[] {
    const activeStates = new Set<AgentLifecycleState>(['running', 'paused']);
    return Array.from(this.entries.entries())
      .filter(([, entry]) => activeStates.has(entry.state))
      .map(([agentId]) => agentId);
  }

  getAllAgents(): Array<{ agentId: string; state: AgentLifecycleState }> {
    return Array.from(this.entries.entries()).map(([agentId, entry]) => ({
      agentId,
      state: entry.state,
    }));
  }

  hasAgent(agentId: string): boolean {
    return this.entries.has(agentId);
  }

  getStateSnapshot(): Map<string, AgentLifecycleState> {
    return new Map(Array.from(this.entries.entries()).map(([agentId, entry]) => [agentId, entry.state]));
  }
}

export const agentLifecycleManager = new AgentLifecycleManager();