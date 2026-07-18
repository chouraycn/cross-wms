import { logger } from '../../../logger.js';
import type { EmbeddedAgentConfig, EmbeddedAgentRunOptions, EmbeddedAgentRunResult } from './types.js';
import { EmbeddedAgent } from './embedded-agent.js';
import { getEmbeddedAgent } from './embedded-agent-registry.js';
import { createEmbeddedAgentFactory } from './embedded-agent-factory.js';

export class EmbeddedAgentRunner {
  private agents = new Map<string, EmbeddedAgent>();
  private factory = createEmbeddedAgentFactory();

  async run(agentId: string, options: EmbeddedAgentRunOptions): Promise<EmbeddedAgentRunResult> {
    let agent = this.agents.get(agentId);

    if (!agent) {
      const config = getEmbeddedAgent(agentId);
      if (!config) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      agent = this.factory.create(config);
      this.agents.set(agentId, agent);
    }

    logger.debug(`[Agents:EmbeddedAgentRunner] Starting run for ${agentId}`);
    const result = await agent.run(options);
    logger.debug(`[Agents:EmbeddedAgentRunner] Completed run for ${agentId} (${result.status})`);

    return result;
  }

  getAgent(agentId: string): EmbeddedAgent | undefined {
    return this.agents.get(agentId);
  }

  createAgent(config: EmbeddedAgentConfig): EmbeddedAgent {
    const agent = this.factory.create(config);
    this.agents.set(config.id, agent);
    return agent;
  }

  removeAgent(agentId: string): boolean {
    const existed = this.agents.has(agentId);
    if (existed) {
      this.agents.delete(agentId);
      logger.debug(`[Agents:EmbeddedAgentRunner] Removed agent: ${agentId}`);
    }
    return existed;
  }

  listActiveAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  getAgentState(agentId: string) {
    const agent = this.agents.get(agentId);
    return agent?.getState();
  }

  pauseAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    return agent?.pause() ?? false;
  }

  resumeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    return agent?.resume() ?? false;
  }

  abortAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    agent?.abort();
  }

  cleanup(): void {
    this.agents.clear();
    logger.debug('[Agents:EmbeddedAgentRunner] Cleaned up all agents');
  }
}

export const embeddedAgentRunner = new EmbeddedAgentRunner();

logger.debug('[Agents:EmbeddedAgentRunner] Module loaded');