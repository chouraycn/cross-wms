import { logger } from '../../logger.js';
import type { HttpRequestLike, HttpResponseLike } from './http-common.js';

export type HttpStage = 'init' | 'parse' | 'auth' | 'rate-limit' | 'route' | 'handle' | 'respond' | 'error';

export type HttpStageHandler = (
  req: HttpRequestLike,
  res: HttpResponseLike,
  context: HttpStageContext,
) => Promise<void> | void;

export type HttpStageContext = {
  startTime: number;
  stage: HttpStage;
  requestId: string;
  params?: Record<string, string>;
  auth?: {
    authorized: boolean;
    method?: string;
    user?: string;
  };
  body?: unknown;
  route?: {
    path: string;
    method: string;
  };
  error?: unknown;
  metadata: Record<string, unknown>;
};

type StageHandlers = Map<HttpStage, Set<HttpStageHandler>>;

const stageHandlers: StageHandlers = new Map();
const globalErrorHandlers = new Set<(error: unknown, context: HttpStageContext) => void>();

export function registerHttpStageHandler(stage: HttpStage, handler: HttpStageHandler): void {
  if (!stageHandlers.has(stage)) {
    stageHandlers.set(stage, new Set());
  }
  stageHandlers.get(stage)!.add(handler);
}

export function unregisterHttpStageHandler(stage: HttpStage, handler: HttpStageHandler): boolean {
  const handlers = stageHandlers.get(stage);
  if (!handlers) return false;
  return handlers.delete(handler);
}

export function registerGlobalErrorHandler(handler: (error: unknown, context: HttpStageContext) => void): void {
  globalErrorHandlers.add(handler);
}

export function unregisterGlobalErrorHandler(handler: (error: unknown, context: HttpStageContext) => void): boolean {
  return globalErrorHandlers.delete(handler);
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createContext(): HttpStageContext {
  return {
    startTime: Date.now(),
    stage: 'init',
    requestId: generateRequestId(),
    metadata: {},
  };
}

async function runStage(
  stage: HttpStage,
  req: HttpRequestLike,
  res: HttpResponseLike,
  context: HttpStageContext,
): Promise<void> {
  context.stage = stage;
  const handlers = stageHandlers.get(stage);
  if (!handlers || handlers.size === 0) {
    return;
  }

  for (const handler of handlers) {
    await Promise.resolve(handler(req, res, context));
  }
}

export async function runHttpPipeline(
  req: HttpRequestLike,
  res: HttpResponseLike,
): Promise<HttpStageContext> {
  const context = createContext();
  logger.debug(`[Gateway] HTTP request ${context.requestId}: ${req.method} ${req.url ?? req.path}`);

  try {
    await runStage('init', req, res, context);
    await runStage('parse', req, res, context);
    await runStage('rate-limit', req, res, context);
    await runStage('auth', req, res, context);
    await runStage('route', req, res, context);
    await runStage('handle', req, res, context);
    await runStage('respond', req, res, context);
  } catch (err) {
    context.error = err;
    context.stage = 'error';

    logger.error(
      `[Gateway] HTTP request ${context.requestId} error:`,
      err,
    );

    for (const handler of globalErrorHandlers) {
      try {
        handler(err, context);
      } catch (handlerErr) {
        logger.error('[Gateway] Error in global error handler:', handlerErr);
      }
    }

    try {
      await runStage('error', req, res, context);
    } catch {
      // ignore errors in error stage
    }
  }

  const duration = Date.now() - context.startTime;
  logger.debug(
    `[Gateway] HTTP request ${context.requestId} completed in ${duration}ms (stage: ${context.stage})`,
  );

  return context;
}

export function getStageHandlers(): Record<HttpStage, number> {
  const result: Record<string, number> = {};
  for (const [stage, handlers] of stageHandlers.entries()) {
    result[stage] = handlers.size;
  }
  return result as Record<HttpStage, number>;
}

export function clearHttpStagesForTests(): void {
  stageHandlers.clear();
  globalErrorHandlers.clear();
}
