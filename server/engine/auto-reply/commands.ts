import { logger } from '../../logger.js';
import {
  detectCommand,
  getCommandByName,
  parseCommandArgs,
  type ChatCommandDefinition,
  type CommandArgs,
  type CommandDetection,
} from './commands-registry.js';

export type CommandDispatchContext = {
  sessionId?: string;
  workspaceDir?: string;
  userId?: string;
  [key: string]: unknown;
};

export type CommandDispatchResult = {
  handled: boolean;
  reply?: string;
  error?: string;
  command?: string;
  args?: CommandArgs;
};

export async function dispatchCommand(
  text: string,
  ctx: CommandDispatchContext = {},
): Promise<CommandDispatchResult> {
  const detection = detectCommand(text);
  if (!detection) {
    return { handled: false };
  }

  const command = getCommandByName(detection.commandName);
  if (!command) {
    return {
      handled: false,
      error: `Unknown command: /${detection.commandName}`,
    };
  }

  let args: CommandArgs | undefined;
  try {
    args = parseCommandArgs(command, detection.argsText);
  } catch (err) {
    logger.warn(`[AutoReply] Failed to parse args for /${detection.commandName}:`, err);
    return {
      handled: true,
      command: command.key,
      error: 'Failed to parse command arguments',
    };
  }

  if (!command.handler) {
    return {
      handled: true,
      command: command.key,
      args,
    };
  }

  try {
    const result = await command.handler(ctx, args);
    return {
      handled: true,
      command: command.key,
      args,
      reply: typeof result === 'string' ? result : undefined,
    };
  } catch (err) {
    logger.error(`[AutoReply] Command /${detection.commandName} failed:`, err);
    return {
      handled: true,
      command: command.key,
      args,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function isSlashCommand(text: string): boolean {
  return text.trim().startsWith('/');
}

export function extractCommandName(text: string): string | null {
  const detection = detectCommand(text);
  return detection ? detection.commandName : null;
}

export type {
  ChatCommandDefinition,
  CommandArgs,
  CommandDetection,
};
