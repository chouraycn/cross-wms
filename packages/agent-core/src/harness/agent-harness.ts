import EventEmitter from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import type {
  AgentRunParams,
  AgentRunResult,
  AgentStatus,
  AgentEvent,
  ToolCall,
} from '../types';
import { Agent } from '../agent';
import { PolicyEngine, AgentPolicy } from './policy';
import { HarnessRegistry } from './registry';
import { HookContextFactory, HookExecutionContext } from './hook-context';
import {
  AgentExecutionPipeline,
  PreprocessingStage,
  ToolSelectionStage,
  ModelValidationStage,
  ToolExecutionStage,
  PipelineContext,
} from './execution-pipeline';

export interface HarnessOptions {
  defaultPolicy?: AgentPolicy;
  maxConcurrentRuns?: number;
  enableTracing?: boolean;
}

export interface HarnessEvent {
  type: 'run_started' | 'run_finished' | 'run_error' | 'tool_executed' | 'policy_violation';
  runId: string;
  sessionId: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface HarnessRunOptions {
  sessionId: string;
  agentId?: string;
  policyId?: string;
  user?: {
    id: string;
    role?: string;
  };
}

export class AgentHarness extends EventEmitter<{
  event: [event: HarnessEvent];
}> {
  private policyEngine: PolicyEngine;
  private registry: HarnessRegistry;
  private hookContextFactory: HookContextFactory;
  private pipeline: AgentExecutionPipeline;
  private activeRuns: Map<string, { agent: Agent; context: HookExecutionContext }> = new Map();
  private maxConcurrentRuns: number;
  private defaultPolicy: AgentPolicy;

  constructor(options: HarnessOptions = {}) {
    super();
    this.policyEngine = new PolicyEngine();
    this.registry = new HarnessRegistry();
    this.hookContextFactory = new HookContextFactory();
    this.maxConcurrentRuns = options.maxConcurrentRuns ?? 100;
    this.defaultPolicy = options.defaultPolicy ?? this.createDefaultPolicy();
    this.policyEngine.registerPolicy(this.defaultPolicy);

    this.pipeline = new AgentExecutionPipeline();
    this.pipeline.addStage(new PreprocessingStage());
    this.pipeline.addStage(new ModelValidationStage());
    this.pipeline.addStage(new ToolSelectionStage());
  }

  private createDefaultPolicy(): AgentPolicy {
    return {
      id: 'default',
      name: 'Default Policy',
      toolRules: [{ toolName: 'default', permission: 'allow' }],
      maxIterations: 10,
    };
  }

  registerPolicy(policy: AgentPolicy): void {
    this.policyEngine.registerPolicy(policy);
  }

  registerTool(id: string, definition: { name: string; description: string; parameters?: Record<string, unknown> }, handler: (args: Record<string, unknown>) => Promise<string>): void {
    this.registry.registerTool(id, {
      name: definition.name,
      description: definition.description,
      parameters: definition.parameters,
    }, handler);
  }

  getRegistry(): HarnessRegistry {
    return this.registry;
  }

  getPolicyEngine(): PolicyEngine {
    return this.policyEngine;
  }

  async run(params: AgentRunParams, options: HarnessRunOptions): Promise<AgentRunResult> {
    if (this.activeRuns.size >= this.maxConcurrentRuns) {
      throw new Error('Max concurrent runs exceeded');
    }

    const runId = uuidv4();
    const agentId = options.agentId ?? 'default-agent';
    const policy = this.policyEngine.getPolicy(options.policyId ?? 'default') ?? this.defaultPolicy;

    const context: PipelineContext = {
      sessionId: options.sessionId,
      runId,
      agentId,
      policy,
      tools: this.registry.listTools(),
      metadata: {
        user: options.user,
      },
    };

    try {
      const processedParams = await this.pipeline.execute<AgentRunParams>(params, context);
      const hookContext = this.hookContextFactory.createExecution(options.sessionId, runId, agentId, 0, policy.maxIterations ?? 10);

      const agent = new Agent({
        maxIterations: policy.maxIterations ?? 10,
        temperature: params.temperature ?? 0.7,
        tools: processedParams.tools,
      });

      this.activeRuns.set(runId, { agent, context: hookContext });

      agent.on('token', (event) => {
        this.hookContextFactory.addEvent(hookContext, event);
      });

      agent.on('tool_call', (event) => {
        this.hookContextFactory.addEvent(hookContext, event);
        const toolCalls = event.data?.toolCalls as ToolCall[] || [];
        toolCalls.forEach(tc => {
          this.hookContextFactory.addToolCall(hookContext, tc.name, tc.arguments);
        });
      });

      agent.on('tool_result', (event) => {
        this.hookContextFactory.addEvent(hookContext, event);
      });

      this.emit('event', {
        type: 'run_started',
        runId,
        sessionId: options.sessionId,
        timestamp: Date.now(),
        data: { model: params.model, agentId },
      });

      const result = await agent.run(processedParams);

      this.emit('event', {
        type: 'run_finished',
        runId,
        sessionId: options.sessionId,
        timestamp: Date.now(),
        data: {
          content: result.content,
          iterations: result.iterations,
          duration: result.duration,
        },
      });

      return result;
    } catch (error) {
      this.emit('event', {
        type: 'run_error',
        runId,
        sessionId: options.sessionId,
        timestamp: Date.now(),
        data: { error: (error as Error).message },
      });

      return {
        content: '',
        messages: params.messages,
        usage: undefined,
        duration: 0,
        iterations: 0,
        error: (error as Error).message,
      };
    } finally {
      this.activeRuns.delete(runId);
    }
  }

  async executeTool(toolName: string, args: Record<string, unknown>, options: HarnessRunOptions): Promise<{ success: boolean; result?: string; error?: string }> {
    const policy = this.policyEngine.getPolicy(options.policyId ?? 'default') ?? this.defaultPolicy;
    const tool = this.registry.getTool(toolName);

    if (!tool) {
      return { success: false, error: `Tool ${toolName} not found` };
    }

    const permission = policy.toolRules.find(r => r.toolName === toolName)?.permission;
    if (permission === 'deny') {
      return { success: false, error: `Tool ${toolName} is not allowed by policy` };
    }

    try {
      const result = await tool.handler(args);
      return { success: true, result };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  stopRun(runId: string): boolean {
    const run = this.activeRuns.get(runId);
    if (!run) return false;

    run.agent.stop();
    this.activeRuns.delete(runId);
    return true;
  }

  getActiveRunCount(): number {
    return this.activeRuns.size;
  }

  getActiveRuns(): Array<{ runId: string; sessionId: string; agentId: string }> {
    return Array.from(this.activeRuns.entries()).map(([runId, { context }]) => ({
      runId,
      sessionId: context.sessionId,
      agentId: context.agentId,
    }));
  }
}