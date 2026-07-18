import { logger } from '../../logger.js';

export type ResolveSessionOptions = {
  sessionKey?: string;
  sessionId?: string;
  sessionFile?: string;
  agentId?: string;
};

export type ResolvedSession = {
  sessionKey: string;
  sessionId?: string;
  sessionFile?: string;
  agentId?: string;
  storePath?: string;
  entry?: Record<string, unknown>;
};

type ResolveHandler = (
  options: ResolveSessionOptions,
) => Promise<ResolvedSession | undefined>;

const resolveHandlers = new Set<ResolveHandler>();

export function registerSessionResolveHandler(handler: ResolveHandler): void {
  resolveHandlers.add(handler);
}

export function unregisterSessionResolveHandler(handler: ResolveHandler): void {
  resolveHandlers.delete(handler);
}

export async function resolveSession(
  options: ResolveSessionOptions,
): Promise<ResolvedSession | undefined> {
  logger.debug(`[Gateway] Resolving session:`, {
    sessionKey: options.sessionKey,
    sessionId: options.sessionId,
  });

  for (const handler of resolveHandlers) {
    try {
      const result = await handler(options);
      if (result) {
        logger.debug(`[Gateway] Session resolved: ${result.sessionKey}`);
        return result;
      }
    } catch (err) {
      logger.error(`[Gateway] Session resolve handler error:`, err);
    }
  }

  logger.debug(`[Gateway] Session not resolved`);
  return undefined;
}

export function validateResolveOptions(options: ResolveSessionOptions): {
  valid: boolean;
  error?: string;
} {
  if (
    !options.sessionKey &&
    !options.sessionId &&
    !options.sessionFile
  ) {
    return { valid: false, error: 'at least one of sessionKey, sessionId, or sessionFile is required' };
  }
  return { valid: true };
}

export async function resolveSessions(
  optionsList: ResolveSessionOptions[],
): Promise<(ResolvedSession | undefined)[]> {
  return Promise.all(optionsList.map((options) => resolveSession(options)));
}
