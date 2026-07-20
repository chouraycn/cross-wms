import EventEmitter from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentOptions,
  AgentRunParams,
  AgentRunResult,
  AgentStatus,
  AgentEvent,
  AgentMessage,
  ToolCall,
  TokenUsage,
  AgentRuntimeDeps,
} from './types';
import { runAgentLoop, type AgentEventSink } from './agent-loop';
import { Tracer } from './tracing';

const DEFAULT_TEMPERATURE = parseFloat(process.env.CROSS_WMS_DEFAULT_TEMPERATURE || '0.7');
const DEFAULT_MAX_TOKENS = parseInt(process.env.CROSS_WMS_DEFAULT_MAX_TOKENS || '4096', 10);
const DEFAULT_TOP_P = parseFloat(process.env.CROSS_WMS_DEFAULT_TOP_P || '1.0');
const DEFAULT_MODEL = process.env.CROSS_WMS_MODELS_DEFAULT || 'gpt-4';

export interface AgentEvents {
  start: [event: AgentEvent];
  agent_start: [event: AgentEvent];
  agent_end: [event: AgentEvent];
  turn_start: [event: AgentEvent];
  turn_end: [event: AgentEvent];
  message_start: [event: AgentEvent];
  message_end: [event: AgentEvent];
  message_update: [event: AgentEvent];
  tool_execution_start: [event: AgentEvent];
  tool_execution_end: [event: AgentEvent];
  finish: [result: AgentRunResult];
  error: [error: Error];
  status_change: [status: AgentStatus];
}

export class Agent extends EventEmitter<AgentEvents> {
  private options: AgentOptions;
  private status: AgentStatus = 'idle';
  private currentRunId: string | null = null;
  private tracer: Tracer;
  private runtime: AgentRuntimeDeps;

  constructor(options: AgentOptions = {}) {
    super();
    this.options = {
      maxIterations: 10,
      temperature: DEFAULT_TEMPERATURE,
      maxTokens: DEFAULT_MAX_TOKENS,
      topP: DEFAULT_TOP_P,
      reasoningEnabled: false,
      ...options,
    };
    this.tracer = new Tracer();
    this.runtime = options.runtime || this.createDefaultRuntime();
  }

  private createDefaultRuntime(): AgentRuntimeDeps {
    throw new Error(
      'Runtime dependencies not provided. Pass runtime option or use Agent with a configured runtime.',
    );
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  private setStatus(status: AgentStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('status_change', status);
    }
  }

  async run(params: AgentRunParams): Promise<AgentRunResult> {
    const runId = uuidv4();
    this.currentRunId = runId;
    this.setStatus('running');

    const startTime = Date.now();
    const span = this.tracer.startSpan(`agent-run-${runId}`, {
      model: params.model || this.options.model,
    });

    const emit: AgentEventSink = (event: AgentEvent) => {
      this.emit(event.type as keyof AgentEvents, event as never);
    };

    this.emit('start', { type: "agent_start" });

    try {
      // If runtime provides streamSimple, use it via a streamFn wrapper
      const streamFn = this.runtime?.streamSimple
        ? async (model: unknown, context: unknown, options: unknown) => {
            const gen = this.runtime.streamSimple!(model, context, options);
            const chunks: string[] = [];
            let result = '';
            for await (const chunk of gen) {
              if (chunk.type === 'token' && chunk.content) {
                chunks.push(chunk.content);
              } else if (chunk.type === 'finish' && chunk.content) {
                result = chunk.content;
              }
            }
            return { result: () => ({ content: result || chunks.join('') }) };
          }
        : undefined;

      const messages = await runAgentLoop(
        params.messages,
        {
          systemPrompt: params.systemPrompt || this.options.systemPrompt || '',
          messages: params.messages,
          tools: params.tools as unknown[] as undefined extends (typeof params.tools)[] ? undefined : never,
        },
        {
          model: { id: params.model || this.options.model || DEFAULT_MODEL, name: params.model || this.options.model || DEFAULT_MODEL, api: "openai", provider: "default" },
          temperature: this.options.temperature ?? DEFAULT_TEMPERATURE,
          maxTokens: this.options.maxTokens ?? DEFAULT_MAX_TOKENS,
          convertToLlm: async (msgs) => msgs as never[],
        },
        emit,
        params.signal,
        streamFn as any,
        this.runtime as any,
      );

      const duration = Date.now() - startTime;
      this.tracer.endSpan(span.id, {});

      const lastMessage = messages[messages.length - 1];
      const content = lastMessage && "content" in lastMessage
        ? (typeof lastMessage.content === "string" ? lastMessage.content : "")
        : "";

      this.emit('finish', {
        content,
        messages,
        usage: undefined,
        duration,
        iterations: 1,
      });

      this.setStatus('idle');
      this.currentRunId = null;

      return {
        content,
        messages,
        usage: undefined,
        duration,
        iterations: 1,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.tracer.failSpan(span.id, (error as Error).message);

      this.emit('error', error as Error);

      this.setStatus('error');
      this.currentRunId = null;

      return {
        content: '',
        messages: params.messages,
        usage: undefined,
        duration,
        iterations: 0,
        error: (error as Error).message,
      };
    }
  }

  stop(): void {
    this.setStatus('stopped');
  }

  getTracer(): Tracer {
    return this.tracer;
  }

  getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  getOptions(): AgentOptions {
    return { ...this.options };
  }

  setOptions(options: Partial<AgentOptions>): void {
    this.options = { ...this.options, ...options };
  }
}
