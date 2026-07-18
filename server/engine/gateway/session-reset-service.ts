import { logger } from '../../logger.js';

export type SessionResetOptions = {
  sessionKey: string;
  preserveHistory?: boolean;
  reason?: string;
  resetModels?: boolean;
};

export type SessionResetResult = {
  ok: boolean;
  newSessionId?: string;
  error?: string;
};

type ResetHandler = (options: SessionResetOptions) => Promise<SessionResetResult>;

const resetHandlers = new Set<ResetHandler>();

export function registerSessionResetHandler(handler: ResetHandler): void {
  resetHandlers.add(handler);
}

export function unregisterSessionResetHandler(handler: ResetHandler): void {
  resetHandlers.delete(handler);
}

export async function resetSession(options: SessionResetOptions): Promise<SessionResetResult> {
  const { sessionKey, reason } = options;

  logger.info(`[Gateway] Resetting session: ${sessionKey}${reason ? ` (${reason})` : ''}`);

  let lastResult: SessionResetResult = { ok: false, error: 'no reset handlers registered' };

  for (const handler of resetHandlers) {
    try {
      const result = await handler(options);
      if (result.ok) {
        lastResult = result;
      }
    } catch (err) {
      logger.error(`[Gateway] Session reset handler error:`, err);
    }
  }

  if (lastResult.ok) {
    logger.info(`[Gateway] Session reset complete: ${sessionKey}`);
  } else {
    logger.warn(`[Gateway] Session reset failed: ${sessionKey} - ${lastResult.error}`);
  }

  return lastResult;
}

export function validateSessionResetOptions(options: SessionResetOptions): {
  valid: boolean;
  error?: string;
} {
  if (!options.sessionKey || options.sessionKey.trim().length === 0) {
    return { valid: false, error: 'sessionKey is required' };
  }
  return { valid: true };
}
