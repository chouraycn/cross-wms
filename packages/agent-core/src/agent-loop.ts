import type {
  AgentMessage,
  ToolCall,
  ToolDefinition,
  TokenUsage,
  AgentRuntimeDeps,
  ReasoningStep,
} from './types';
import { ReasoningEngine } from './reasoning';

export interface AgentLoopOptions {
  runtime: AgentRuntimeDeps;
  model: string;
  maxIterations: number;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  reasoningEnabled?: boolean;
  onToken?: (content: string) => void;
  onThinking?: (content: string) => void;
  onToolCall?: (toolCalls: ToolCall[]) => void;
  onIteration?: (iteration: number) => void;
  signal?: AbortSignal;
}

export interface AgentLoopResult {
  content: string;
  thinkingContent?: string;
  toolCalls?: ToolCall[];
  messages: AgentMessage[];
  usage?: TokenUsage;
  iterations: number;
}

export class AgentLoop {
  private options: AgentLoopOptions;
  private reasoningEngine: ReasoningEngine;
  private messages: AgentMessage[] = [];
  private usage: TokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  private iterations = 0;
  private thinkingContent = '';

  constructor(options: AgentLoopOptions) {
    this.options = options;
    this.reasoningEngine = new ReasoningEngine();
  }

  async execute(params: {
    messages: AgentMessage[];
    tools: ToolDefinition[];
    systemPrompt?: string;
  }): Promise<AgentLoopResult> {
    this.messages = [...params.messages];

    if (params.systemPrompt) {
      const hasSystem = this.messages.some((m) => m.role === 'system');
      if (!hasSystem) {
        this.messages.unshift({
          id: 'system-0',
          role: 'system',
          content: params.systemPrompt,
          timestamp: Date.now(),
        });
      }
    }

    let finalContent = '';
    let finalToolCalls: ToolCall[] | undefined;

    for (let i = 0; i < this.options.maxIterations; i++) {
      this.iterations = i + 1;
      this.options.onIteration?.(i + 1);

      this.checkAbort();

      if (this.options.reasoningEnabled) {
        const step = await this.reasoningEngine.plan(this.messages);
        this.thinkingContent += step.content;
        this.options.onThinking?.(step.content);
      }

      const response = await this.callModel(params.tools);

      if (response.toolCalls && response.toolCalls.length > 0) {
        finalToolCalls = response.toolCalls;
        this.options.onToolCall?.(response.toolCalls);

        this.messages.push({
          id: `msg-${Date.now()}-${i}`,
          role: 'assistant',
          content: response.content,
          tool_calls: response.toolCalls,
          timestamp: Date.now(),
        });

        for (const toolCall of response.toolCalls) {
          const toolResult = await this.executeTool(toolCall, params.tools);
          this.messages.push({
            id: `tool-${Date.now()}-${toolCall.id}`,
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult,
            timestamp: Date.now(),
          });
        }
      } else {
        finalContent = response.content;
        break;
      }
    }

    return {
      content: finalContent,
      thinkingContent: this.thinkingContent || undefined,
      toolCalls: finalToolCalls,
      messages: this.messages,
      usage: this.usage,
      iterations: this.iterations,
    };
  }

  private async callModel(tools: ToolDefinition[]): Promise<{
    content: string;
    toolCalls?: ToolCall[];
    usage?: TokenUsage;
  }> {
    const response = await this.options.runtime.completeSimple(
      this.options.model,
      this.messages,
      {
        temperature: this.options.temperature,
        maxTokens: this.options.maxTokens,
        topP: this.options.topP,
        tools: tools.length > 0 ? tools : undefined,
      },
    );

    if (response.usage) {
      this.usage.promptTokens += response.usage.promptTokens;
      this.usage.completionTokens += response.usage.completionTokens;
      this.usage.totalTokens += response.usage.totalTokens;
    }

    return response as {
      content: string;
      toolCalls?: ToolCall[];
      usage?: TokenUsage;
    };
  }

  private async executeTool(
    toolCall: ToolCall,
    tools: ToolDefinition[],
  ): Promise<string> {
    const tool = tools.find((t) => t.name === toolCall.function.name);
    if (!tool) {
      return JSON.stringify({ error: `Tool ${toolCall.function.name} not found` });
    }

    try {
      const args = JSON.parse(toolCall.function.arguments);
      return JSON.stringify({ result: `Executed ${toolCall.function.name}`, args });
    } catch (e) {
      return JSON.stringify({ error: `Invalid arguments: ${(e as Error).message}` });
    }
  }

  private checkAbort(): void {
    if (this.options.signal?.aborted) {
      throw new Error('Agent execution aborted');
    }
  }
}
