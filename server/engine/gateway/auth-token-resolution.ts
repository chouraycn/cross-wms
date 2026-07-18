import { randomBytes, createHash } from 'node:crypto';

export type TokenType = 'bearer' | 'api-key' | 'bootstrap' | 'device' | 'session';

export type ResolvedToken = {
  type: TokenType;
  value: string;
  prefix?: string;
  scopes?: string[];
  expiresAt?: number;
  issuedAt?: number;
  subject?: string;
};

export function extractTokenFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): ResolvedToken | undefined {
  const authHeader = typeof headers['authorization'] === 'string' ? headers['authorization'] : undefined;

  if (authHeader) {
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch?.[1]) {
      return {
        type: 'bearer',
        value: bearerMatch[1],
        prefix: 'Bearer',
      };
    }

    const basicMatch = authHeader.match(/^Basic\s+(.+)$/i);
    if (basicMatch?.[1]) {
      try {
        const decoded = Buffer.from(basicMatch[1], 'base64').toString('utf-8');
        const colonIndex = decoded.indexOf(':');
        const token = colonIndex >= 0 ? decoded.slice(colonIndex + 1) : decoded;
        return {
          type: 'bearer',
          value: token,
          prefix: 'Basic',
        };
      } catch {
        // invalid base64
      }
    }
  }

  const apiKeyHeader = typeof headers['x-api-key'] === 'string' ? headers['x-api-key'] : undefined;
  if (apiKeyHeader) {
    return {
      type: 'api-key',
      value: apiKeyHeader,
    };
  }

  const bootstrapToken =
    typeof headers['x-bootstrap-token'] === 'string' ? headers['x-bootstrap-token'] : undefined;
  if (bootstrapToken) {
    return {
      type: 'bootstrap',
      value: bootstrapToken,
    };
  }

  const deviceToken =
    typeof headers['x-device-token'] === 'string' ? headers['x-device-token'] : undefined;
  if (deviceToken) {
    return {
      type: 'device',
      value: deviceToken,
    };
  }

  return undefined;
}

export function extractTokenFromQuery(
  query: Record<string, string | string[] | undefined>,
): ResolvedToken | undefined {
  const tokenParam = typeof query['token'] === 'string' ? query['token'] : undefined;
  if (tokenParam) {
    return {
      type: 'bearer',
      value: tokenParam,
    };
  }

  const apiKeyParam = typeof query['api_key'] === 'string' ? query['api_key'] : undefined;
  if (apiKeyParam) {
    return {
      type: 'api-key',
      value: apiKeyParam,
    };
  }

  return undefined;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(length = 32): string {
  return randomBytes(length).toString('hex');
}

export function validateTokenFormat(token: string, type?: TokenType): boolean {
  if (!token || token.trim().length === 0) {
    return false;
  }

  const trimmed = token.trim();

  switch (type) {
    case 'bearer':
      return trimmed.length >= 8;
    case 'api-key':
      return /^[a-zA-Z0-9_\-]{8,}$/.test(trimmed);
    case 'bootstrap':
      return trimmed.length >= 16;
    case 'device':
      return trimmed.length >= 8;
    case 'session':
      return trimmed.length >= 8;
    default:
      return trimmed.length >= 4;
  }
}

export function isTokenExpired(token: ResolvedToken): boolean {
  if (!token.expiresAt) {
    return false;
  }
  return Date.now() > token.expiresAt;
}
