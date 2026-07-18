import { logger } from '../../../logger.js';
import type { EmbeddedAgentConfig } from './types.js';
import { EmbeddedAgentConfigSchema } from './types.js';
import { EmbeddedAgent } from './embedded-agent.js';
import { registerEmbeddedAgent } from './embedded-agent-registry.js';

export interface EmbeddedAgentFactoryOptions {
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
  defaultTimeoutMs?: number;
}

const factoryDefaults: EmbeddedAgentFactoryOptions = {
  defaultModel: 'gpt-4o',
  defaultTemperature: 0.7,
  defaultMaxTokens: 4096,
  defaultTimeoutMs: 120000,
};

export function createEmbeddedAgentFactory(options: EmbeddedAgentFactoryOptions = {}): {
  create: (config: Omit<EmbeddedAgentConfig, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'> & Partial<Pick<EmbeddedAgentConfig, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'>>) => EmbeddedAgent;
  createAndRegister: (config: Omit<EmbeddedAgentConfig, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'> & Partial<Pick<EmbeddedAgentConfig, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'>>) => EmbeddedAgent;
} {
  const mergedOptions = { ...factoryDefaults, ...options };

  function create(config: Omit<EmbeddedAgentConfig, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'> & Partial<Pick<EmbeddedAgentConfig, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'>>): EmbeddedAgent {
    const fullConfig: EmbeddedAgentConfig = EmbeddedAgentConfigSchema.parse({
      model: config.model ?? mergedOptions.defaultModel,
      temperature: config.temperature ?? mergedOptions.defaultTemperature,
      maxTokens: config.maxTokens ?? mergedOptions.defaultMaxTokens,
      timeoutMs: config.timeoutMs ?? mergedOptions.defaultTimeoutMs,
      ...config,
    });

    logger.debug(`[Agents:EmbeddedAgentFactory] Created agent: ${fullConfig.id}`);
    return new EmbeddedAgent(fullConfig);
  }

  function createAndRegister(config: Omit<EmbeddedAgentConfig, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'> & Partial<Pick<EmbeddedAgentConfig, 'model' | 'temperature' | 'maxTokens' | 'timeoutMs'>>): EmbeddedAgent {
    const agent = create(config);
    registerEmbeddedAgent(agent.config);
    return agent;
  }

  return { create, createAndRegister };
}

export const embeddedAgentFactory = createEmbeddedAgentFactory();

logger.debug('[Agents:EmbeddedAgentFactory] Module loaded');