import EventEmitter from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentOptions,
  AgentRunParams,
  AgentRunResult,
  AgentStatus,
  AgentEventType,
  AgentEvent,
  AgentMessage,
  ToolCall,
  TokenUsage,
  AgentRuntimeDeps,
  ReasoningStep,
} from './types';
import { AgentLoop } from './agent-loop';
import { Tracer } from './tracing';

export interface AgentEvents {
  start: [event: AgentEvent];
  token: [event: AgentEvent];
  thinking: [event: AgentEvent];
  tool_call: [event: AgentEvent];
  tool_result: [event: AgentEvent];
  iteration: [event: AgentEvent];
  finish: [event: AgentEvent];
  error: [event: AgentEvent];
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
      temperature: 0.7,
      maxTokens: 4096,
      topP: 1.0,
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

    this.emit('start', {
      type: 'start',
      runId,
      timestamp: startTime,
      data: { model: params.model || this.options.model },
    });

    try {
      const loop = new AgentLoop({
        runtime: this.runtime,
        model: params.model || this.options.model || 'gpt-4',
        maxIterations: this.options.maxIterations ?? 10,
        temperature: this.options.temperature ?? 0.7,
        maxTokens: this.options.maxTokens ?? 4096,
        topP: this.options.topP ?? 1.0,
        reasoningEnabled: this.options.reasoningEnabled ?? false,
        onToken: (content: string) => {
          this.emit('token', {
            type: 'token',
            runId,
            timestamp: Date.now(),
            data: { content },
          });
        },
        onThinking: (content: string) => {
          this.emit('thinking', {
            type: 'thinking',
            runId,
            timestamp: Date.now(),
            data: { content },
          });
        },
        onToolCall: (toolCalls: ToolCall[]) => {
          this.emit('tool_call', {
            type: 'tool_call',
            runId,
            timestamp: Date.now(),
            data: { toolCalls },
          });
        },
        onIteration: (iteration: number) => {
          this.emit('iteration', {
            type: 'iteration',
            runId,
            timestamp: Date.now(),
            data: { iteration },
          });
        },
        signal: params.signal,
      });

      const result = await loop.execute({
        messages: params.messages,
        tools: params.tools || this.options.tools || [],
        systemPrompt: params.systemPrompt || this.options.systemPrompt,
      });

      const duration = Date.now() - startTime;
      this.tracer.endSpan(span.id, { iterations: result.iterations });

      this.emit('finish', {
        type: 'finish',
        runId,
        timestamp: Date.now(),
        data: { content: result.content, duration, iterations: result.iterations },
      });

      this.setStatus('idle');
      this.currentRunId = null;

      return {
        ...result,
        duration,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.tracer.failSpan(span.id, (error as Error).message);

      this.emit('error', {
        type: 'error',
        runId,
        timestamp: Date.now(),
        data: { error: (error as Error).message },
      });

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
