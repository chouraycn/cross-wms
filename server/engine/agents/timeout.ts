export const DEFAULT_AGENT_TIMEOUT_MS = 120_000;
export const MAX_AGENT_TIMEOUT_MS = 300_000;

export interface AgentTimeoutConfig {
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  perAgentTimeouts?: Record<string, number>;
}

export const DEFAULT_TIMEOUT_CONFIG: AgentTimeoutConfig = {
  defaultTimeoutMs: DEFAULT_AGENT_TIMEOUT_MS,
  maxTimeoutMs: MAX_AGENT_TIMEOUT_MS,
};

export function resolveAgentTimeout(agentId: string, config?: AgentTimeoutConfig): number {
  const resolvedConfig = config ?? DEFAULT_TIMEOUT_CONFIG;
  const perAgent = resolvedConfig.perAgentTimeouts?.[agentId];
  if (perAgent !== undefined) {
    return Math.min(perAgent, resolvedConfig.maxTimeoutMs);
  }
  return resolvedConfig.defaultTimeoutMs;
}

export function clampTimeout(timeoutMs: number, config?: AgentTimeoutConfig): number {
  const max = config?.maxTimeoutMs ?? MAX_AGENT_TIMEOUT_MS;
  return Math.min(Math.max(1000, timeoutMs), max);
}
