import { logger } from '../../logger.js';
import type { ToolDefinition } from '../../aiClient.js';

export interface ToolPlan {
  tools: Array<{
    toolName: string;
    args: Record<string, unknown>;
    dependencies?: string[];
    priority: number;
  }>;
  estimatedCost?: number;
  estimatedDurationMs?: number;
}

export interface PlanningResult {
  plan: ToolPlan;
  reasoning: string;
  confidence: number;
}

export class ToolPlanner {
  private tools: ToolDefinition[] = [];

  registerTool(tool: ToolDefinition): void {
    this.tools.push(tool);
    logger.debug(`[Tools:Planner] Registered tool: ${tool.function.name}`);
  }

  registerTools(tools: ToolDefinition[]): void {
    this.tools.push(...tools);
  }

  plan(goal: string): PlanningResult {
    logger.debug(`[Tools:Planner] Planning for goal: ${goal}`);

    const tools = this.findRelevantTools(goal);
    const plan = this.createPlan(tools, goal);

    return {
      plan,
      reasoning: `Generated plan for goal: ${goal}`,
      confidence: 0.7,
    };
  }

  private findRelevantTools(goal: string): ToolDefinition[] {
    const lowerGoal = goal.toLowerCase();
    return this.tools.filter(tool => {
      const description = (tool.function.description ?? '').toLowerCase();
      const name = tool.function.name.toLowerCase();
      return lowerGoal.includes(name) || lowerGoal.includes(description);
    });
  }

  private createPlan(tools: ToolDefinition[], _goal: string): ToolPlan {
    const plannedTools = tools.map((tool, index) => ({
      toolName: tool.function.name,
      args: {},
      priority: index,
    }));

    return {
      tools: plannedTools,
      estimatedCost: tools.length * 0.1,
      estimatedDurationMs: tools.length * 1000,
    };
  }

  getRegisteredTools(): ToolDefinition[] {
    return [...this.tools];
  }

  clear(): void {
    this.tools = [];
  }
}

export function planToolExecution(
  goal: string,
  tools: ToolDefinition[],
): PlanningResult {
  const planner = new ToolPlanner();
  planner.registerTools(tools);
  return planner.plan(goal);
}
