import { logger } from '../../../logger.js';
import type { HookHandler } from '../types.js';

export const commandLoggerHook: HookHandler = async (event) => {
  if (event.type === 'command') {
    const command = event.context.command as string | undefined;
    const args = event.context.args as Record<string, unknown> | undefined;
    const sessionKey = event.sessionKey;

    logger.info(`[command-logger] [${sessionKey}] Command: ${command}`, {
      args,
      timestamp: event.timestamp.toISOString(),
    });
  }
};

export const commandLoggerBootstrapHook: HookHandler = async (event) => {
  if (event.type === 'command' && event.action === 'bootstrap') {
    logger.info('[command-logger] Command bootstrap started', {
      sessionKey: event.sessionKey,
      timestamp: event.timestamp.toISOString(),
    });
  }
};

export const commandLoggerNewHook: HookHandler = async (event) => {
  if (event.type === 'command' && event.action === 'new') {
    const command = event.context.command as string | undefined;
    const input = event.context.input as string | undefined;
    const sessionKey = event.sessionKey;

    logger.info(`[command-logger] [${sessionKey}] New command: ${command}`, {
      input,
      timestamp: event.timestamp.toISOString(),
    });
  }
};

export const commandLoggerCompleteHook: HookHandler = async (event) => {
  if (event.type === 'command' && event.action === 'complete') {
    const command = event.context.command as string | undefined;
    const output = event.context.output as string | undefined;
    const success = event.context.success as boolean | undefined;
    const sessionKey = event.sessionKey;

    logger.info(`[command-logger] [${sessionKey}] Command completed: ${command}`, {
      success,
      output: typeof output === 'string' ? output.slice(0, 500) : output,
      timestamp: event.timestamp.toISOString(),
    });
  }
};