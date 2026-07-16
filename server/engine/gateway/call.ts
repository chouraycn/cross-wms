import { logger } from '../../logger.js';

export type CallGatewayOptions = {
  url: string;
  method: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
  token?: string;
};

export class GatewayTransportError extends Error {
  readonly kind: 'closed' | 'timeout';
  readonly connectionDetails: string;
  readonly code?: number;
  readonly reason?: string;
  readonly timeoutMs?: number;

  constructor(kind: 'closed' | 'timeout', message: string, details: {
    connectionDetails: string;
    code?: number;
    reason?: string;
    timeoutMs?: number;
  }) {
    super(message);
    this.name = 'GatewayTransportError';
    this.kind = kind;
    this.connectionDetails = details.connectionDetails;
    this.code = details.code;
    this.reason = details.reason;
    this.timeoutMs = details.timeoutMs;
  }
}

export class GatewayCredentialsRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayCredentialsRequiredError';
  }
}

export function isGatewayTransportError(err: unknown): err is GatewayTransportError {
  return err instanceof GatewayTransportError;
}

export function isGatewayCredentialsRequiredError(err: unknown): err is GatewayCredentialsRequiredError {
  return err instanceof GatewayCredentialsRequiredError;
}

export function randomIdempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export async function callGateway<T = unknown>(options: CallGatewayOptions): Promise<T> {
  const { url, method, params, timeoutMs = 30_000, token } = options;
  logger.info(`[Gateway:Call] ${method} → ${url}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ method, params, idempotencyKey: randomIdempotencyKey() }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new GatewayTransportError('closed', `HTTP ${response.status}: ${response.statusText}`, {
        connectionDetails: url,
        code: response.status,
        reason: response.statusText,
      });
    }

    const json = await response.json() as { result?: T; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    return json.result as T;
  } catch (err) {
    if (err instanceof GatewayTransportError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GatewayTransportError('timeout', `Request timeout after ${timeoutMs}ms`, {
        connectionDetails: url,
        timeoutMs,
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function callGatewayWithScopes<T = unknown>(
  options: CallGatewayOptions,
  scopes: string[],
): Promise<T> {
  logger.debug(`[Gateway:Call] scopes=${scopes.join(',')}`);
  return callGateway<T>(options);
}

export async function callGatewayCli<T = unknown>(
  options: CallGatewayOptions,
  clientMode?: string,
): Promise<T> {
  logger.debug(`[Gateway:Call] clientMode=${clientMode ?? 'default'}`);
  return callGateway<T>(options);
}
