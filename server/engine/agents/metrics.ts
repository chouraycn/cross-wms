import { logger } from '../../logger.js';

export interface AgentMetrics {
  agentId: string;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  abortedRuns: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastRunAt?: number;
  successRate: number;
}

const metricsStore = new Map<string, AgentMetrics>();

export function recordRunOutcome(agentId: string, outcome: 'success' | 'failed' | 'aborted', durationMs: number): void {
  const current = metricsStore.get(agentId) ?? createEmptyMetrics(agentId);
  current.totalRuns++;
  current.totalDurationMs += durationMs;
  current.avgDurationMs = current.totalDurationMs / current.totalRuns;
  current.lastRunAt = Date.now();

  if (outcome === 'success') current.successfulRuns++;
  else if (outcome === 'failed') current.failedRuns++;
  else if (outcome === 'aborted') current.abortedRuns++;

  current.successRate = current.totalRuns > 0 ? current.successfulRuns / current.totalRuns : 0;
  metricsStore.set(agentId, current);
  logger.debug(`[Agents:Metrics] ${agentId} ${outcome} run (${durationMs}ms)`);
}

function createEmptyMetrics(agentId: string): AgentMetrics {
  return {
    agentId,
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    abortedRuns: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    successRate: 0,
  };
}

export function getAgentMetrics(agentId: string): AgentMetrics | undefined {
  return metricsStore.get(agentId);
}

export function listAgentMetrics(): AgentMetrics[] {
  return Array.from(metricsStore.values());
}

export function resetAgentMetrics(agentId?: string): void {
  if (agentId) {
    metricsStore.delete(agentId);
  } else {
    metricsStore.clear();
  }
}

export function getTopPerformers(limit: number = 10): AgentMetrics[] {
  return listAgentMetrics()
    .sort((a, b) => b.successRate - a.successRate || b.totalRuns - a.totalRuns)
    .slice(0, limit);
}
