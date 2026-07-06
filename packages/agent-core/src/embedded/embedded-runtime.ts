import type { AgentRunParams, AgentRunResult, AgentMessage, ToolDefinition, ToolCall } from '../types';

export type EmbeddedRuntimeEnvironment = 'browser' | 'node' | 'wasm' | 'react-native';

export interface EmbeddedRuntimeConfig {
  environment: EmbeddedRuntimeEnvironment;
  maxIterations?: number;
  streaming?: boolean;
  timeoutMs?: number;
  enableCaching?: boolean;
  cacheSize?: number;
}

export interface EmbeddedTool {
  definition: ToolDefinition;
  handler: (args: Record<string, unknown>) => Promise<string>;
}

export interface EmbeddedModel {
  id: string;
  name: string;
  maxTokens: number;
  supportsStreaming: boolean;
  generate: (messages: AgentMessage[], options?: { temperature?: number; maxTokens?: number; tools?: ToolDefinition[] }) => Promise<string>;
  generateStream?: (messages: AgentMessage[], options?: { temperature?: number; maxTokens?: number; tools?: ToolDefinition[] }) => AsyncIterable<string>;
}

export class EmbeddedRuntime {
  private config: EmbeddedRuntimeConfig;
  private tools: Map<string, EmbeddedTool> = new Map();
  private models: Map<string, EmbeddedModel> = new Map();
  private cache: Map<string, string> = new Map();

  constructor(config: EmbeddedRuntimeConfig) {
    this.config = {
      maxIterations: 5,
      streaming: false,
      timeoutMs: 30000,
      enableCaching: true,
      cacheSize: 100,
      ...config,
    };
  }

  registerTool(tool: EmbeddedTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  registerModel(model: EmbeddedModel): void {
    this.models.set(model.id, model);
  }

  getModel(id: string): EmbeddedModel | undefined {
    return this.models.get(id);
  }

  getTools(): EmbeddedTool[] {
    return Array.from(this.tools.values());
  }

  private getCacheKey(messages: AgentMessage[], modelId: string): string {
    const content = JSON.stringify(messages);
    return `${modelId}:${content}`;
  }

  private getFromCache(messages: AgentMessage[], modelId: string): string | undefined {
    if (!this.config.enableCaching) return undefined;
    return this.cache.get(this.getCacheKey(messages, modelId));
  }

  private addToCache(messages: AgentMessage[], modelId: string, result: string): void {
    if (!this.config.enableCaching) return;
    if (this.cache.size >= this.config.cacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(this.getCacheKey(messages, modelId), result);
  }

  async executeTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new Error(`Tool ${toolName} not found`);
    }
    return tool.handler(args);
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const { messages, model: modelId, tools, temperature, maxTokens, systemPrompt } = params;
    const model = this.getModel(modelId || 'default');

    if (!model) {
      return {
        content: '',
        messages,
        usage: undefined,
        duration: 0,
        iterations: 0,
        error: `Model ${modelId} not found`,
      };
    }

    const startTime = Date.now();
    let iterations = 0;
    let content = '';

    const cachedResult = this.getFromCache(messages, modelId || '');
    if (cachedResult) {
      const duration = Date.now() - startTime;
      return {
        content: cachedResult,
        messages,
        usage: undefined,
        duration,
        iterations: 0,
      };
    }

    try {
      for (let i = 0; i < (this.config.maxIterations || 5); i++) {
        iterations++;

        const effectiveMessages = systemPrompt
          ? [{ role: 'system' as const, content: systemPrompt }, ...(messages || [])]
          : messages || [];

        const toolDefinitions = tools?.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })) || this.getTools().map(t => t.definition);

        const response = await model.generate(effectiveMessages, {
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens ?? 1024,
          tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
        });

        const toolCall = this.parseToolCall(response);
        if (!toolCall) {
          content = response;
          break;
        }

        try {
          const toolResult = await this.executeTool(toolCall.name, toolCall.arguments);
          messages?.push({
            role: 'assistant' as const,
            content: response,
          });
          messages?.push({
            role: 'tool' as const,
            content: toolResult,
          });
        } catch (error) {
          messages?.push({
            role: 'assistant' as const,
            content: response,
          });
          messages?.push({
            role: 'tool' as const,
            content: `Error: ${(error as Error).message}`,
          });
        }
      }

      this.addToCache(messages || [], modelId || '', content);

      const duration = Date.now() - startTime;
      return {
        content,
        messages,
        usage: undefined,
        duration,
        iterations,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        content: '',
        messages,
        usage: undefined,
        duration,
        iterations,
        error: (error as Error).message,
      };
    }
  }

  private parseToolCall(content: string): ToolCall | null {
    try {
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);

      if (parsed.tool_calls && Array.isArray(parsed.tool_calls) && parsed.tool_calls.length > 0) {
        return {
          name: parsed.tool_calls[0].function.name,
          arguments: parsed.tool_calls[0].function.arguments,
        };
      }

      if (parsed.function) {
        return {
          name: parsed.function.name,
          arguments: parsed.function.arguments,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  async *runStream(params: AgentRunParams): AsyncIterable<{ type: 'token' | 'tool_call' | 'finish'; content?: string; toolCall?: ToolCall; iterations?: number; duration?: number }> {
    const { messages, model: modelId, temperature, maxTokens, systemPrompt } = params;
    const model = this.getModel(modelId || 'default');

    if (!model) {
      yield { type: 'finish', iterations: 0, duration: 0 };
      return;
    }

    const startTime = Date.now();
    let iterations = 0;

    for (let i = 0; i < (this.config.maxIterations || 5); i++) {
      iterations++;

      const effectiveMessages = systemPrompt
        ? [{ role: 'system' as const, content: systemPrompt }, ...(messages || [])]
        : messages || [];

      if (model.generateStream) {
        let buffer = '';
        for await (const chunk of model.generateStream(effectiveMessages, {
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens ?? 1024,
        })) {
          buffer += chunk;
          yield { type: 'token', content: chunk };
        }

        const toolCall = this.parseToolCall(buffer);
        if (!toolCall) {
          yield { type: 'finish', iterations, duration: Date.now() - startTime };
          return;
        }

        yield { type: 'tool_call', toolCall };

        try {
          const toolResult = await this.executeTool(toolCall.name, toolCall.arguments);
          messages?.push({
            role: 'assistant' as const,
            content: buffer,
          });
          messages?.push({
            role: 'tool' as const,
            content: toolResult,
          });
        } catch (error) {
          messages?.push({
            role: 'assistant' as const,
            content: buffer,
          });
          messages?.push({
            role: 'tool' as const,
            content: `Error: ${(error as Error).message}`,
          });
        }
      } else {
        const response = await model.generate(effectiveMessages, {
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens ?? 1024,
        });

        yield { type: 'token', content: response };

        const toolCall = this.parseToolCall(response);
        if (!toolCall) {
          yield { type: 'finish', iterations, duration: Date.now() - startTime };
          return;
        }

        yield { type: 'tool_call', toolCall };

        try {
          const toolResult = await this.executeTool(toolCall.name, toolCall.arguments);
          messages?.push({
            role: 'assistant' as const,
            content: response,
          });
          messages?.push({
            role: 'tool' as const,
            content: toolResult,
          });
        } catch (error) {
          messages?.push({
            role: 'assistant' as const,
            content: response,
          });
          messages?.push({
            role: 'tool' as const,
            content: `Error: ${(error as Error).message}`,
          });
        }
      }
    }

    yield { type: 'finish', iterations, duration: Date.now() - startTime };
  }
}