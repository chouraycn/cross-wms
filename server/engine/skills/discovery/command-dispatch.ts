import { getLogger } from "../../logging/logger.js";
import { getCommandSpec, validateCommandParams } from "./command-specs.js";

const logger = getLogger();

export type DispatchRequest = {
  skillName: string;
  command: string;
  params: Record<string, unknown>;
  context?: Record<string, unknown>;
};

export type DispatchResponse = {
  success: boolean;
  result?: unknown;
  error?: string;
  command?: string;
};

export type CommandHandler = (
  request: DispatchRequest,
) => Promise<DispatchResponse> | DispatchResponse;

type HandlerKey = string;

const commandHandlers = new Map<HandlerKey, CommandHandler>();

function getHandlerKey(skillName: string, command: string): HandlerKey {
  return `${skillName.toLowerCase()}:${command.toLowerCase()}`;
}

export function registerCommandHandler(
  skillName: string,
  command: string,
  handler: CommandHandler,
): void {
  const key = getHandlerKey(skillName, command);
  commandHandlers.set(key, handler);
  logger.debug(`Registered command handler: ${skillName}/${command}`);
}

export function unregisterCommandHandler(skillName: string, command: string): boolean {
  const key = getHandlerKey(skillName, command);
  const existed = commandHandlers.delete(key);
  if (existed) {
    logger.debug(`Unregistered command handler: ${skillName}/${command}`);
  }
  return existed;
}

export function hasCommandHandler(skillName: string, command: string): boolean {
  const key = getHandlerKey(skillName, command);
  return commandHandlers.has(key);
}

export function listAvailableCommands(skillName?: string): string[] {
  const commands: string[] = [];

  for (const key of commandHandlers.keys()) {
    const [sName, cmd] = key.split(":");
    if (skillName === undefined || sName === skillName.toLowerCase()) {
      commands.push(cmd);
    }
  }

  return commands.sort();
}

export async function dispatchCommand(request: DispatchRequest): Promise<DispatchResponse> {
  const { skillName, command, params, context } = request;

  logger.debug(`Dispatching command: ${skillName}/${command}`);

  const spec = getCommandSpec(skillName, command);
  if (spec) {
    const validation = validateCommandParams(skillName, command, params);
    if (!validation.valid) {
      const errorMsg = validation.errors.join("; ");
      logger.warn(`Command validation failed: ${skillName}/${command} - ${errorMsg}`);
      return {
        success: false,
        error: `Parameter validation failed: ${errorMsg}`,
        command,
      };
    }
  }

  const key = getHandlerKey(skillName, command);
  const handler = commandHandlers.get(key);

  if (!handler) {
    logger.warn(`No handler found for command: ${skillName}/${command}`);
    return {
      success: false,
      error: `No handler registered for command '${command}' in skill '${skillName}'`,
      command,
    };
  }

  try {
    const result = await handler(request);
    return {
      ...result,
      command,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`Command handler error: ${skillName}/${command} - ${errorMessage}`);
    return {
      success: false,
      error: `Command execution failed: ${errorMessage}`,
      command,
    };
  }
}

export function clearCommandHandlers(): void {
  commandHandlers.clear();
  logger.debug("Command handlers cleared");
}
