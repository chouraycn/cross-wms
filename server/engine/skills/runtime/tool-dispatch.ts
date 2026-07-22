import type { SkillCommandSpec } from "../types.js";
import { logSkillExecution } from "../../logging/index.js";
import { recordExecution } from "../metrics/skill-metrics.js";

export type ToolDispatchContext = {
  skillName: string;
  commandName: string;
  toolName?: string;
  args?: Record<string, unknown>;
  rawArgs?: string;
};

export type ToolDispatchResult = {
  success: boolean;
  output?: string;
  error?: string;
  toolInvoked?: string;
};

export type ToolHandler = (
  context: ToolDispatchContext,
) => Promise<ToolDispatchResult> | ToolDispatchResult;

const toolHandlers = new Map<string, ToolHandler>();

export function registerToolHandler(toolName: string, handler: ToolHandler): void {
  toolHandlers.set(toolName, handler);
}

export function unregisterToolHandler(toolName: string): boolean {
  return toolHandlers.delete(toolName);
}

export function getToolHandler(toolName: string): ToolHandler | undefined {
  return toolHandlers.get(toolName);
}

export function hasToolHandler(toolName: string): boolean {
  return toolHandlers.has(toolName);
}

export function listRegisteredTools(): string[] {
  return [...toolHandlers.keys()].sort();
}

export async function dispatchSkillCommand(
  command: SkillCommandSpec,
  args?: Record<string, unknown>,
  rawArgs?: string,
): Promise<ToolDispatchResult> {
  const toolName = command.dispatch?.toolName;

  if (!toolName) {
    return {
      success: false,
      error: `Command '${command.name}' has no dispatch tool configured`,
    };
  }

  const handler = toolHandlers.get(toolName);
  if (!handler) {
    return {
      success: false,
      error: `No handler registered for tool '${toolName}'`,
    };
  }

  const context: ToolDispatchContext = {
    skillName: command.skillName,
    commandName: command.name,
    toolName,
    args,
    rawArgs,
  };

  const startTime = Date.now();

  try {
    const result = await handler(context);
    const durationMs = Date.now() - startTime;
    logSkillExecution(command.skillName, `dispatch:${command.name}`, durationMs, result.success, result.error);
    recordExecution(command.skillName, durationMs, result.success);
    return {
      ...result,
      toolInvoked: toolName,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorMessage = err instanceof Error ? err.message : String(err);
    logSkillExecution(command.skillName, `dispatch:${command.name}`, durationMs, false, errorMessage);
    recordExecution(command.skillName, durationMs, false);
    return {
      success: false,
      error: `Tool '${toolName}' failed: ${errorMessage}`,
      toolInvoked: toolName,
    };
  }
}

export type SkillToolRegistry = {
  register: typeof registerToolHandler;
  unregister: typeof unregisterToolHandler;
  has: typeof hasToolHandler;
  list: typeof listRegisteredTools;
  dispatch: typeof dispatchSkillCommand;
};

export function createSkillToolRegistry(): SkillToolRegistry {
  return {
    register: registerToolHandler,
    unregister: unregisterToolHandler,
    has: hasToolHandler,
    list: listRegisteredTools,
    dispatch: dispatchSkillCommand,
  };
}

export function clearToolHandlers(): void {
  toolHandlers.clear();
}
