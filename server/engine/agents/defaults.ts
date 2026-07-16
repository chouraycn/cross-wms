import { logger } from '../../logger.js';

export interface DefaultAgentConfig {
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  timeoutMs: number;
  enableTools: boolean;
  enableMemory: boolean;
}

export const DEFAULT_AGENT_CONFIG: DefaultAgentConfig = {
  model: 'gpt-4o',
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: '',
  timeoutMs: 120_000,
  enableTools: true,
  enableMemory: true,
};

export function getDefaultAgentConfig(): DefaultAgentConfig {
  return { ...DEFAULT_AGENT_CONFIG };
}

export function applyDefaultConfig(config: Partial<DefaultAgentConfig>): DefaultAgentConfig {
  const merged = { ...DEFAULT_AGENT_CONFIG, ...config };
  logger.debug('[Agents:Defaults] Applied default config');
  return merged;
}
