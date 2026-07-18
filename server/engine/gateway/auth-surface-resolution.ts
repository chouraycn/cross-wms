import type { GatewayAuthSurface } from './auth.js';

export type AuthSurfaceInfo = {
  surface: GatewayAuthSurface;
  path: string;
  method?: string;
  protocol: 'http' | 'ws';
  description: string;
  scopes?: string[];
  requiresAuth: boolean;
};

const surfaceRegistry = new Map<string, AuthSurfaceInfo>();

export function registerAuthSurface(info: AuthSurfaceInfo): void {
  const key = `${info.protocol}:${info.path}`;
  surfaceRegistry.set(key, info);
}

export function unregisterAuthSurface(path: string, protocol: 'http' | 'ws'): void {
  const key = `${protocol}:${path}`;
  surfaceRegistry.delete(key);
}

export function resolveAuthSurface(params: {
  path: string;
  method?: string;
  protocol: 'http' | 'ws';
  headers?: Record<string, string | string[] | undefined>;
}): GatewayAuthSurface {
  const { path, protocol, headers } = params;

  const upgradeHeader =
    typeof headers?.upgrade === 'string' ? headers.upgrade : undefined;
  const isWebSocket = protocol === 'ws' || upgradeHeader?.toLowerCase() === 'websocket';

  if (isWebSocket) {
    if (path.includes('control') || path.includes('ui')) {
      return 'ws-control-ui';
    }
    return 'ws-control-ui';
  }

  const exactKey = `${protocol}:${path}`;
  const exactMatch = surfaceRegistry.get(exactKey);
  if (exactMatch) {
    return exactMatch.surface;
  }

  for (const [key, info] of surfaceRegistry.entries()) {
    const pattern = key.replace(/:[^/]+/g, '[^/]+');
    const regex = new RegExp(`^${pattern}$`);
    if (regex.test(`${protocol}:${path}`)) {
      return info.surface;
    }
  }

  return 'http';
}

export function getSurfaceInfo(
  surface: GatewayAuthSurface,
): AuthSurfaceInfo | undefined {
  for (const info of surfaceRegistry.values()) {
    if (info.surface === surface) {
      return info;
    }
  }
  return undefined;
}

export function listAuthSurfaces(): AuthSurfaceInfo[] {
  return Array.from(surfaceRegistry.values());
}

export function requiresAuthForSurface(params: {
  path: string;
  protocol: 'http' | 'ws';
  method?: string;
  authMode?: string;
}): boolean {
  const surface = resolveAuthSurface(params);
  const info = getSurfaceInfo(surface);

  if (params.authMode === 'none') {
    return false;
  }

  return info?.requiresAuth ?? true;
}

export function getScopesForSurface(params: {
  path: string;
  protocol: 'http' | 'ws';
  method?: string;
}): string[] {
  const surface = resolveAuthSurface(params);
  const info = getSurfaceInfo(surface);
  return info?.scopes ?? [];
}
