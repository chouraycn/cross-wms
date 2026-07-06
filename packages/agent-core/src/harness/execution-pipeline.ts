import type { ToolCall, AgentMessage, AgentRunParams } from '../types';
import type { RegisteredTool } from './registry';
import type { AgentPolicy } from './policy';

export interface PipelineStage<T = unknown, R = unknown> {
  name: string;
  execute(input: T, context: PipelineContext): Promise<R>;
}

export interface PipelineContext {
  sessionId: string;
  runId: string;
  agentId: string;
  policy: AgentPolicy;
  tools: RegisteredTool[];
  metadata: Record<string, unknown>;
}

export class AgentExecutionPipeline {
  private stages: PipelineStage[] = [];

  addStage(stage: PipelineStage): void {
    this.stages.push(stage);
  }

  async execute<T>(params: AgentRunParams, context: PipelineContext): Promise<T> {
    let result: unknown = params;

    for (const stage of this.stages) {
      try {
        result = await stage.execute(result, context);
      } catch (error) {
        throw new Error(`Pipeline stage ${stage.name} failed: ${(error as Error).message}`);
      }
    }

    return result as T;
  }
}

export class PreprocessingStage implements PipelineStage<AgentRunParams, AgentRunParams> {
  name = 'preprocessing';

  async execute(input: AgentRunParams, context: PipelineContext): Promise<AgentRunParams> {
    const sanitizedMessages = input.messages?.map(msg => ({
      ...msg,
      content: typeof msg.content === 'string' ? msg.content.trim() : msg.content,
    }));

    return {
      ...input,
      messages: sanitizedMessages,
    };
  }
}

export class ToolSelectionStage implements PipelineStage<AgentRunParams, AgentRunParams> {
  name = 'tool-selection';

  async execute(input: AgentRunParams, context: PipelineContext): Promise<AgentRunParams> {
    const filteredTools = input.tools?.filter(tool => {
      const permission = context.policy.toolRules.find(r => r.toolName === tool.name)?.permission;
      if (permission === 'deny') return false;
      return true;
    });

    return {
      ...input,
      tools: filteredTools,
    };
  }
}

export class ModelValidationStage implements PipelineStage<AgentRunParams, AgentRunParams> {
  name = 'model-validation';

  async execute(input: AgentRunParams, context: PipelineContext): Promise<AgentRunParams> {
    const model = input.model;
    if (!model) {
      throw new Error('Model is required');
    }

    if (context.policy.deniedModels?.includes(model)) {
      throw new Error(`Model ${model} is not allowed by policy`);
    }

    if (context.policy.allowedModels && !context.policy.allowedModels.includes(model)) {
      throw new Error(`Model ${model} is not in allowed list`);
    }

    return input;
  }
}

export class ToolExecutionStage implements PipelineStage<ToolCall[], Array<{ toolCall: ToolCall; result: string; error?: string }>> {
  name = 'tool-execution';

  async execute(toolCalls: ToolCall[], context: PipelineContext): Promise<Array<{ toolCall: ToolCall; result: string; error?: string }>> {
    const results: Array<{ toolCall: ToolCall; result: string; error?: string }> = [];

    for (const toolCall of toolCalls) {
      const registeredTool = context.tools.find(t => t.definition.name === toolCall.name);
      
      if (!registeredTool) {
        results.push({ toolCall, result: '', error: `Tool ${toolCall.name} not found` });
        continue;
      }

      const permission = context.policy.toolRules.find(r => r.toolName === toolCall.name)?.permission;
      if (permission === 'deny') {
        results.push({ toolCall, result: '', error: `Tool ${toolCall.name} is not allowed by policy` });
        continue;
      }

      try {
        const result = await registeredTool.handler(toolCall.arguments);
        results.push({ toolCall, result });
      } catch (error) {
        results.push({ toolCall, result: '', error: (error as Error).message });
      }
    }

    return results;
  }
}