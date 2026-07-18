import { logger } from '../../../logger.js';
import type { EmbeddedAgentConfig, EmbeddedAgentState, EmbeddedAgentRunOptions, EmbeddedAgentRunResult } from './types.js';

export class EmbeddedAgent {
  readonly config: EmbeddedAgentConfig;
  private state: EmbeddedAgentState;
  private taskQueue: Array<() => Promise<void>> = [];
  private isProcessing = false;

  constructor(config: EmbeddedAgentConfig) {
    this.config = config;
    this.state = {
      agentId: config.id,
      status: 'idle',
      lastActivity: Date.now(),
    };
  }

  getState(): EmbeddedAgentState {
    return { ...this.state };
  }

  getId(): string {
    return this.config.id;
  }

  getName(): string {
    return this.config.name;
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async run(options: EmbeddedAgentRunOptions): Promise<EmbeddedAgentRunResult> {
    const startTime = Date.now();
    const turnCount = 0;
    const toolCalls: Array<{ toolName: string; arguments: Record<string, unknown>; result: unknown }> = [];

    this.setState({ status: 'running', currentTask: options.input });

    try {
      const result = await this.executeTurn(options);
      toolCalls.push(...(result.toolCalls ?? []));

      return {
        agentId: this.config.id,
        output: result.output,
        status: 'success',
        toolCalls,
        turnCount: turnCount + 1,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      logger.error(`[Agents:EmbeddedAgent] Run failed for ${this.config.id}:`, error);
      this.setState({ status: 'failed', error: error instanceof Error ? error.message : String(error) });
      return {
        agentId: this.config.id,
        output: '',
        status: 'failed',
        toolCalls,
        turnCount: turnCount + 1,
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.setState({ status: 'idle', currentTask: undefined });
    }
  }

  private async executeTurn(options: EmbeddedAgentRunOptions): Promise<{ output: string; toolCalls?: Array<{ toolName: string; arguments: Record<string, unknown>; result: unknown }> }> {
    return {
      output: '',
      toolCalls: [],
    };
  }

  pause(): boolean {
    if (this.state.status !== 'running') return false;
    this.setState({ status: 'paused' });
    return true;
  }

  resume(): boolean {
    if (this.state.status !== 'paused') return false;
    this.setState({ status: 'running' });
    return true;
  }

  abort(): void {
    this.setState({ status: 'completed', currentTask: undefined });
  }

  updateConfig(updates: Partial<Omit<EmbeddedAgentConfig, 'id'>>): void {
    (this.config as EmbeddedAgentConfig) = { ...this.config, ...updates };
    logger.debug(`[Agents:EmbeddedAgent] Updated config for ${this.config.id}`);
  }

  private setState(state: Partial<EmbeddedAgentState>): void {
    this.state = { ...this.state, ...state, lastActivity: Date.now() };
  }
}

logger.debug('[Agents:EmbeddedAgent] Module loaded');