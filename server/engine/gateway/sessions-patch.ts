import { logger } from '../../logger.js';
import { triggerSessionPatchHook } from './session-patch-hooks.js';

export type SessionsPatchParams = {
  sessionKey: string;
  patch: Record<string, unknown>;
};

export type SessionsPatchResult = {
  ok: boolean;
  entry?: Record<string, unknown>;
  error?: string;
  resolved?: {
    modelProvider?: string;
    model?: string;
    agentRuntime?: string;
  };
};

type PatchHandler = (
  params: SessionsPatchParams,
) => Promise<SessionsPatchResult>;

const patchHandlers = new Set<PatchHandler>();

export function registerSessionsPatchHandler(handler: PatchHandler): void {
  patchHandlers.add(handler);
}

export function unregisterSessionsPatchHandler(handler: PatchHandler): void {
  patchHandlers.delete(handler);
}

export async function patchSession(
  params: SessionsPatchParams,
  cfg: Record<string, unknown> = {},
): Promise<SessionsPatchResult> {
  const { sessionKey, patch } = params;

  logger.debug(`[Gateway] Patching session: ${sessionKey}`);

  let lastResult: SessionsPatchResult = { ok: false, error: 'no patch handlers registered' };

  for (const handler of patchHandlers) {
    try {
      const result = await handler(params);
      if (result.ok) {
        lastResult = result;

        if (result.entry) {
          triggerSessionPatchHook({
            cfg,
            sessionEntry: result.entry,
            sessionKey,
            patch,
          });
        }
      }
    } catch (err) {
      logger.error(`[Gateway] Session patch handler error:`, err);
    }
  }

  if (lastResult.ok) {
    logger.debug(`[Gateway] Session patch complete: ${sessionKey}`);
  } else {
    logger.warn(`[Gateway] Session patch failed: ${sessionKey} - ${lastResult.error}`);
  }

  return lastResult;
}

export function validateSessionsPatchParams(params: SessionsPatchParams): {
  valid: boolean;
  error?: string;
} {
  if (!params.sessionKey || params.sessionKey.trim().length === 0) {
    return { valid: false, error: 'sessionKey is required' };
  }
  if (!params.patch || typeof params.patch !== 'object') {
    return { valid: false, error: 'patch must be an object' };
  }
  return { valid: true };
}
