import { logger } from '../../logger.js';
import { authorizeGatewayConnect, type AuthorizeGatewayConnectParams, type GatewayAuthResult, type GatewayAuthSurface } from './auth.js';
import { extractTokenFromHeaders, extractTokenFromQuery } from './auth-token-resolution.js';
import { resolveAuthSurface } from './auth-surface-resolution.js';
import { checkRateLimit, incrementRateLimit } from './auth-rate-limit.js';
import { getRequestPath, getRequestQuery, type HttpRequestLike } from './http-common.js';

export type AuthorizeRequestOptions = {
  auth: AuthorizeGatewayConnectParams['auth'];
  trustedProxies?: string[];
  clientIp?: string;
  rateLimitScope?: string;
  rateLimitConfig?: {
    maxAttempts: number;
    windowMs: number;
    lockoutDurationMs?: number;
  };
  surface?: GatewayAuthSurface;
  allowQueryToken?: boolean;
};

export type AuthorizeRequestResult = {
  authorized: boolean;
  authResult?: GatewayAuthResult;
  status: number;
  reason?: string;
  rateLimited?: boolean;
  retryAfterMs?: number;
};

export function authorizeRequest(
  req: HttpRequestLike,
  options: AuthorizeRequestOptions,
): AuthorizeRequestResult {
  const { auth, trustedProxies, clientIp, rateLimitScope, rateLimitConfig, allowQueryToken = false } = options;

  const path = getRequestPath(req);
  const method = req.method?.toUpperCase() ?? 'GET';
  const protocol = method === 'GET' && req.headers.upgrade ? 'ws' : 'http';

  const surface = options.surface ?? resolveAuthSurface({
    path,
    method,
    protocol: protocol as 'http' | 'ws',
    headers: req.headers,
  });

  const rateLimitKey = clientIp ?? 'unknown';

  if (rateLimitConfig) {
    const rateCheck = checkRateLimit(rateLimitKey, {
      ...rateLimitConfig,
      scope: rateLimitScope,
    });
    if (!rateCheck.allowed) {
      logger.warn(`[Gateway] Rate limited request from ${rateLimitKey}`);
      return {
        authorized: false,
        status: 429,
        reason: 'rate limit exceeded',
        rateLimited: true,
        retryAfterMs: rateCheck.retryAfterMs,
      };
    }
  }

  let tokenFromQuery: string | undefined;
  if (allowQueryToken) {
    const query = getRequestQuery(req);
    const resolved = extractTokenFromQuery(query);
    tokenFromQuery = resolved?.value;
  }

  const authResult = authorizeGatewayConnect({
    auth,
    req: {
      headers: req.headers,
      remoteAddr: clientIp,
    },
    trustedProxies,
    clientIp,
    rateLimitScope,
    authSurface: surface,
  });

  if (!authResult.ok) {
    if (rateLimitConfig) {
      incrementRateLimit(rateLimitKey, {
        ...rateLimitConfig,
        scope: rateLimitScope,
      });
    }

    logger.debug(`[Gateway] Unauthorized request from ${clientIp ?? 'unknown'}: ${authResult.reason}`);

    return {
      authorized: false,
      authResult,
      status: 401,
      reason: authResult.reason,
    };
  }

  return {
    authorized: true,
    authResult,
    status: 200,
  };
}

export function createAuthMiddleware(options: AuthorizeRequestOptions) {
  return (req: HttpRequestLike, _res: unknown, _params: Record<string, string>) => {
    const result = authorizeRequest(req, options);
    if (!result.authorized) {
      const error = new Error(result.reason ?? 'Unauthorized') as Error & { status?: number };
      error.status = result.status;
      throw error;
    }
  };
}

export function extractClientIp(req: HttpRequestLike): string | undefined {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim();
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0];
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') {
    return realIp;
  }

  return req.ip;
}
