import type { AgentMessage, ReasoningStep } from './types';
import type { Model, SimpleStreamOptions, ModelThinkingLevel } from "@cdf-know/llm-core";
import { resolveClaudeFable5ModelIdentity } from "@cdf-know/llm-core";
import { v4 as uuidv4 } from 'uuid';

export type ReasoningMode = 'none' | 'simple' | 'deep' | 'adaptive';

export interface ReasoningOptions {
  mode?: ReasoningMode;
  maxDepth?: number;
  maxSteps?: number;
  enableReflection?: boolean;
}

export class ReasoningEngine {
  private options: ReasoningOptions;
  private steps: ReasoningStep[] = [];

  constructor(options: ReasoningOptions = {}) {
    this.options = {
      mode: 'simple',
      maxDepth: 3,
      maxSteps: 10,
      enableReflection: true,
      ...options,
    };
  }

  async plan(messages: AgentMessage[]): Promise<ReasoningStep> {
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const content = lastUserMessage
      ? this.generatePlanText(String(lastUserMessage.content))
      : '规划下一步行动...';

    const step: ReasoningStep = {
      id: uuidv4(),
      type: 'plan',
      content,
      timestamp: Date.now(),
    };

    this.steps.push(step);
    return step;
  }

  async observe(
    observation: string,
    context?: Record<string, unknown>,
  ): Promise<ReasoningStep> {
    const step: ReasoningStep = {
      id: uuidv4(),
      type: 'observation',
      content: observation,
      timestamp: Date.now(),
      metadata: context,
    };

    this.steps.push(step);
    return step;
  }

  async reflect(
    currentState: string,
    previousSteps: ReasoningStep[],
  ): Promise<ReasoningStep> {
    if (!this.options.enableReflection) {
      return {
        id: uuidv4(),
        type: 'reflection',
        content: '',
        timestamp: Date.now(),
      };
    }

    const reflections = this.generateReflectionText(currentState, previousSteps);

    const step: ReasoningStep = {
      id: uuidv4(),
      type: 'reflection',
      content: reflections,
      timestamp: Date.now(),
    };

    this.steps.push(step);
    return step;
  }

  async think(thought: string): Promise<ReasoningStep> {
    const step: ReasoningStep = {
      id: uuidv4(),
      type: 'thought',
      content: thought,
      timestamp: Date.now(),
    };

    this.steps.push(step);
    return step;
  }

  private generatePlanText(userInput: string): string {
    if (this.options.mode === 'none') return '';

    return `让我分析这个问题：${userInput.slice(0, 100)}...

我需要：
1. 理解用户需求
2. 确定最佳解决方案
3. 逐步执行
4. 验证结果

开始执行...`;
  }

  private generateReflectionText(
    currentState: string,
    previousSteps: ReasoningStep[],
  ): string {
    const stepCount = previousSteps.length;
    return `反思：
- 当前状态：${currentState}
- 已完成步骤：${stepCount}
- 下一步优化：考虑是否需要调整策略...`;
  }

  getSteps(): ReasoningStep[] {
    return [...this.steps];
  }

  getMode(): ReasoningMode {
    return this.options.mode || 'simple';
  }

  setMode(mode: ReasoningMode): void {
    this.options.mode = mode;
  }

  reset(): void {
    this.steps = [];
  }

  getSummary(): string {
    return this.steps.map((s) => `[${s.type}] ${s.content.slice(0, 50)}...`).join('\n');
  }
}

type EnabledThinkingLevel = Exclude<ModelThinkingLevel, "off">;

const ENABLED_THINKING_LEVELS = new Set<string>([
  "minimal", "low", "medium", "high", "xhigh", "max",
]);

function isEnabledThinkingLevel(value: unknown): value is EnabledThinkingLevel {
  return typeof value === "string" && ENABLED_THINKING_LEVELS.has(value);
}

/** Resolve the thinking/reasoning option for the given model and thinking level. */
export function resolveAgentReasoningOption(
  model: Model,
  thinkingLevel: ModelThinkingLevel,
): SimpleStreamOptions["reasoning"] {
  if (thinkingLevel !== "off") {
    return thinkingLevel;
  }
  const offFallback =
    (model as Record<string, unknown>).thinkingLevelMap !== undefined
      ? ((model as Record<string, unknown>).thinkingLevelMap as Record<string, unknown>).off as string | undefined
      : ((model.api === "anthropic-messages" || model.api === "bedrock-converse-stream") &&
        resolveClaudeFable5ModelIdentity(model.id as never)
          ? "low"
          : undefined);
  return isEnabledThinkingLevel(offFallback) ? offFallback : undefined;
}
