import EventEmitter from 'eventemitter3';
import type { AgentRunParams, AgentRunResult, ToolCall } from '../types';
import { EmbeddedRuntime, EmbeddedRuntimeConfig, EmbeddedTool, EmbeddedModel } from './embedded-runtime';

export interface EmbeddedAgentOptions {
  runtimeConfig?: EmbeddedRuntimeConfig;
  defaultModelId?: string;
  tools?: EmbeddedTool[];
  models?: EmbeddedModel[];
}

export interface EmbeddedAgentEvents {
  token: [content: string];
  tool_call: [toolCall: ToolCall];
  tool_result: [result: string];
  finish: [result: AgentRunResult];
  error: [error: Error];
}

export class EmbeddedAgent extends EventEmitter<EmbeddedAgentEvents> {
  private runtime: EmbeddedRuntime;
  private defaultModelId: string;

  constructor(options: EmbeddedAgentOptions = {}) {
    super();
    this.defaultModelId = options.defaultModelId ?? 'default';
    this.runtime = new EmbeddedRuntime(options.runtimeConfig || { environment: 'node' });

    options.tools?.forEach(tool => this.runtime.registerTool(tool));
    options.models?.forEach(model => this.runtime.registerModel(model));
  }

  registerTool(tool: EmbeddedTool): void {
    this.runtime.registerTool(tool);
  }

  registerModel(model: EmbeddedModel): void {
    this.runtime.registerModel(model);
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const result = await this.runtime.run({
      ...params,
      model: params.model || this.defaultModelId,
    });

    if (result.error) {
      this.emit('error', new Error(result.error));
    } else {
      this.emit('finish', result);
    }

    return result;
  }

  async *runStream(params: AgentRunParams): AsyncIterable<string> {
    const modelId = params.model || this.defaultModelId;

    for await (const event of this.runtime.runStream({
      ...params,
      model: modelId,
    })) {
      switch (event.type) {
        case 'token':
          this.emit('token', event.content || '');
          yield event.content || '';
          break;
        case 'tool_call':
          if (event.toolCall) {
            this.emit('tool_call', event.toolCall);
          }
          break;
        case 'finish':
          this.emit('finish', {
            content: '',
            messages: params.messages,
            usage: undefined,
            duration: event.duration,
            iterations: event.iterations,
          });
          break;
      }
    }
  }

  getRuntime(): EmbeddedRuntime {
    return this.runtime;
  }

  setDefaultModel(modelId: string): void {
    this.defaultModelId = modelId;
  }
}