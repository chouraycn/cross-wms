import { Request, Response, NextFunction } from 'express';

interface ErrorResponse {
  error: string;
  code: string;
  details?: unknown;
  timestamp: string;
  requestId?: string;
}

export function createErrorHandler(logger: { error: (msg: string, ...args: unknown[]) => void }) {
  return (err: unknown, req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as any)?.id || (req as any)?.requestId || 'unknown';
    const timestamp = new Date().toISOString();

    let errorCode = 'INTERNAL_ERROR';
    let errorMessage = '服务器内部错误';
    let details: unknown;

    if (err instanceof Error) {
      errorMessage = err.message;
      
      if (err.message.includes('not found') || err.message.includes('不存在')) {
        errorCode = 'NOT_FOUND';
        res.status(404);
      } else if (err.message.includes('invalid') || err.message.includes('不能为空') || err.message.includes('must be')) {
        errorCode = 'INVALID_PARAMS';
        res.status(400);
      } else if (err.message.includes('permission') || err.message.includes('无权')) {
        errorCode = 'FORBIDDEN';
        res.status(403);
      } else if (err.message.includes('rate limit')) {
        errorCode = 'RATE_LIMITED';
        res.status(429);
      } else {
        res.status(500);
      }

      logger.error(`[${requestId}] Error: ${errorCode} - ${errorMessage}`, {
        stack: err.stack,
        path: req.path,
        method: req.method,
      });
    } else {
      logger.error(`[${requestId}] Unknown error:`, err, {
        path: req.path,
        method: req.method,
      });
    }

    const response: ErrorResponse = {
      error: errorMessage,
      code: errorCode,
      timestamp,
      requestId,
    };
    if (details) {
      response.details = details;
    }

    res.json(response);
  };
}

export function rateLimitMiddleware(
  options: { max: number; windowMs: number } = { max: 100, windowMs: 60000 }
) {
  const store = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const forwardedFor = req.headers['x-forwarded-for'];
    const forwardedForKey = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const key = req.ip || forwardedForKey || 'unknown';
    const now = Date.now();
    const entry = store.get(String(key));

    if (entry && now < entry.resetTime) {
      entry.count++;
      if (entry.count > options.max) {
        res.status(429);
        return next(new Error('rate limit exceeded'));
      }
    } else {
      store.set(String(key), { count: 1, resetTime: now + options.windowMs });
    }

    res.setHeader('X-RateLimit-Limit', options.max.toString());
    res.setHeader('X-RateLimit-Remaining', (options.max - (store.get(key)?.count || 1)).toString());
    res.setHeader('X-RateLimit-Reset', ((now + options.windowMs) / 1000).toString());

    next();
  };
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  (req as any).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export function logMiddleware(logger: { info: (msg: string, ...args: unknown[]) => void }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const requestId = (req as any)?.id || 'unknown';

    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`[${requestId}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
        requestId,
      });
    });

    next();
  };
}