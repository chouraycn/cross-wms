import { logger } from '../../logger.js';

export interface AgentUsageRecord {
  agentId: string;
  sessionId: string;
  startTime: number;
  endTime?: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  errors: number;
}

export interface AgentUsage {
  totalSessions: number;
  totalTokens: number;
  totalToolCalls: number;
  totalErrors: number;
  records: AgentUsageRecord[];
}

const agentUsageStore = new Map<string, AgentUsage>();

export function trackAgentUsage(record: AgentUsageRecord): void {
  const usage = agentUsageStore.get(record.agentId) ?? {
    totalSessions: 0,
    totalTokens: 0,
    totalToolCalls: 0,
    totalErrors: 0,
    records: [],
  };

  usage.totalSessions++;
  usage.totalTokens += record.inputTokens + record.outputTokens;
  usage.totalToolCalls += record.toolCalls;
  usage.totalErrors += record.errors;
  usage.records.push(record);

  agentUsageStore.set(record.agentId, usage);
  logger.debug(`[Agents:Usage] Tracked usage for ${record.agentId}`);
}

export function getAgentUsage(agentId?: string): AgentUsage | undefined {
  if (agentId) {
    return agentUsageStore.get(agentId);
  }
  const allRecords: AgentUsageRecord[] = [];
  let totalSessions = 0;
  let totalTokens = 0;
  let totalToolCalls = 0;
  let totalErrors = 0;

  for (const usage of agentUsageStore.values()) {
    allRecords.push(...usage.records);
    totalSessions += usage.totalSessions;
    totalTokens += usage.totalTokens;
    totalToolCalls += usage.totalToolCalls;
    totalErrors += usage.totalErrors;
  }

  return {
    totalSessions,
    totalTokens,
    totalToolCalls,
    totalErrors,
    records: allRecords,
  };
}

export function resetAgentUsage(agentId?: string): void {
  if (agentId) {
    agentUsageStore.delete(agentId);
  } else {
    agentUsageStore.clear();
  }
}
