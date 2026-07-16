import { logger } from '../../logger.js';

export type GatewayAuthSurface = 'http' | 'ws-control-ui';

export type GatewayAuthResult = {
  ok: boolean;
  method: 'none' | 'token' | 'password' | 'tailscale' | 'device-token' | 'bootstrap-token' | 'trusted-proxy';
  user?: string;
  reason?: string;
  rateLimited?: boolean;
  retryAfterMs?: number;
};

export type AuthorizeGatewayConnectParams = {
  auth: { mode?: string; token?: string; password?: string; trustedProxies?: string[] };
  req: { headers: Record<string, string | string[] | undefined>; remoteAddr?: string };
  trustedProxies?: string[];
  clientIp?: string;
  rateLimitScope?: string;
  authSurface: GatewayAuthSurface;
};

function safeEqualSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export function authorizeTokenAuth(providedToken: string | undefined, expectedToken: string | undefined): GatewayAuthResult {
  if (!expectedToken) {
    return { ok: false, method: 'token', reason: 'no token configured' };
  }
  if (!providedToken) {
    return { ok: false, method: 'token', reason: 'no token provided' };
  }
  if (!safeEqualSecret(providedToken, expectedToken)) {
    return { ok: false, method: 'token', reason: 'invalid token' };
  }
  return { ok: true, method: 'token' };
}

export function authorizePasswordAuth(providedPassword: string | undefined, expectedPassword: string | undefined): GatewayAuthResult {
  if (!expectedPassword) {
    return { ok: false, method: 'password', reason: 'no password configured' };
  }
  if (!providedPassword) {
    return { ok: false, method: 'password', reason: 'no password provided' };
  }
  if (!safeEqualSecret(providedPassword, expectedPassword)) {
    return { ok: false, method: 'password', reason: 'invalid password' };
  }
  return { ok: true, method: 'password' };
}

export function authorizeTrustedProxy(
  clientIp: string,
  trustedProxies: string[],
  forwardedUser?: string,
): GatewayAuthResult {
  if (!trustedProxies.includes(clientIp)) {
    return { ok: false, method: 'trusted-proxy', reason: 'not a trusted proxy' };
  }
  return { ok: true, method: 'trusted-proxy', user: forwardedUser };
}

export function authorizeGatewayConnect(params: AuthorizeGatewayConnectParams): GatewayAuthResult {
  const { auth, req, clientIp } = params;
  const mode = auth.mode ?? 'none';

  if (mode === 'none') {
    return { ok: true, method: 'none' };
  }

  const authHeader = typeof req.headers['authorization'] === 'string' ? req.headers['authorization'] : undefined;
  const tokenMatch = authHeader?.match(/^Bearer\s+(.+)$/i);
  const providedToken = tokenMatch?.[1];

  const passwordHeader = typeof req.headers['x-gateway-password'] === 'string' ? req.headers['x-gateway-password'] : undefined;

  const forwardedUser = typeof req.headers['x-forwarded-user'] === 'string' ? req.headers['x-forwarded-user'] : undefined;

  switch (mode) {
    case 'token':
      return authorizeTokenAuth(providedToken, auth.token);
    case 'password':
      return authorizePasswordAuth(passwordHeader, auth.password);
    case 'trusted-proxy':
      if (!clientIp) return { ok: false, method: 'trusted-proxy', reason: 'cannot determine client IP' };
      return authorizeTrustedProxy(clientIp, auth.trustedProxies ?? [], forwardedUser);
    default:
      return { ok: false, method: 'none', reason: `unknown auth mode: ${mode}` };
  }
}

export function authorizeHttpGatewayConnect(
  auth: AuthorizeGatewayConnectParams['auth'],
  req: AuthorizeGatewayConnectParams['req'],
  trustedProxies?: string[],
  clientIp?: string,
): GatewayAuthResult {
  return authorizeGatewayConnect({ auth, req, trustedProxies, clientIp, authSurface: 'http' });
}

export function authorizeWsControlUiGatewayConnect(
  auth: AuthorizeGatewayConnectParams['auth'],
  req: AuthorizeGatewayConnectParams['req'],
  trustedProxies?: string[],
  clientIp?: string,
): GatewayAuthResult {
  return authorizeGatewayConnect({ auth, req, trustedProxies, clientIp, authSurface: 'ws-control-ui' });
}

export function assertGatewayAuthConfigured(auth: AuthorizeGatewayConnectParams['auth']): void {
  const mode = auth.mode ?? 'none';
  if (mode === 'token' && !auth.token) {
    throw new Error('Gateway auth mode is token but no token is configured');
  }
  if (mode === 'password' && !auth.password) {
    throw new Error('Gateway auth mode is password but no password is configured');
  }
}
