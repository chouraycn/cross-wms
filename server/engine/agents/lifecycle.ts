import { logger } from '../../logger.js';

export type AgentLifecycleState =
  | 'created'
  | 'initializing'
  | 'idle'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'destroyed';

export interface AgentLifecycleEvent {
  agentId: string;
  from: AgentLifecycleState;
  to: AgentLifecycleState;
  timestamp: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

const VALID_TRANSITIONS: Record<AgentLifecycleState, AgentLifecycleState[]> = {
  created: ['initializing', 'destroyed'],
  initializing: ['idle', 'failed', 'destroyed'],
  idle: ['running', 'destroyed'],
  running: ['paused', 'completed', 'failed', 'aborted', 'destroyed'],
  paused: ['running', 'aborted', 'destroyed'],
  completed: ['idle', 'destroyed'],
  failed: ['idle', 'destroyed'],
  aborted: ['idle', 'destroyed'],
  destroyed: [],
};

const stateStore = new Map<string, AgentLifecycleState>();
const historyStore = new Map<string, AgentLifecycleEvent[]>();

export function getAgentState(agentId: string): AgentLifecycleState {
  return stateStore.get(agentId) ?? 'created';
}

export function setAgentState(agentId: string, next: AgentLifecycleState, reason?: string, metadata?: Record<string, unknown>): boolean {
  const current = getAgentState(agentId);
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    logger.warn(`[Agents:Lifecycle] Invalid transition for ${agentId}: ${current} -> ${next}`);
    return false;
  }
  stateStore.set(agentId, next);
  const event: AgentLifecycleEvent = { agentId, from: current, to: next, timestamp: Date.now(), reason, metadata };
  const history = historyStore.get(agentId) ?? [];
  history.push(event);
  historyStore.set(agentId, history);
  logger.debug(`[Agents:Lifecycle] ${agentId}: ${current} -> ${next}${reason ? ` (${reason})` : ''}`);
  return true;
}

export function getAgentHistory(agentId: string): AgentLifecycleEvent[] {
  return [...(historyStore.get(agentId) ?? [])];
}

export function canTransition(from: AgentLifecycleState, to: AgentLifecycleState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

export function isTerminalState(state: AgentLifecycleState): boolean {
  return state === 'destroyed' || state === 'completed' || state === 'failed' || state === 'aborted';
}

export function isActiveState(state: AgentLifecycleState): boolean {
  return state === 'running' || state === 'paused';
}

export function clearAgentLifecycle(agentId: string): void {
  stateStore.delete(agentId);
  historyStore.delete(agentId);
}
