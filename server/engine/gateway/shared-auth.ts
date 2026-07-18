import { randomBytes, createHash } from 'node:crypto';
import { logger } from '../../logger.js';

export type SharedAuthState = {
  token: string | null;
  tokenHash: string | null;
  tokenCreatedAt: number | null;
  tokenExpiresAt: number | null;
  rotationIntervalMs: number;
  enabled: boolean;
};

export type SharedAuthSessionBinding = {
  sessionKey: string;
  tokenHash: string;
  boundAt: number;
  expiresAt?: number;
};

let sharedAuthState: SharedAuthState = {
  token: null,
  tokenHash: null,
  tokenCreatedAt: null,
  tokenExpiresAt: null,
  rotationIntervalMs: 86400000,
  enabled: false,
};

const sessionBindings = new Map<string, SharedAuthSessionBinding>();

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateSharedToken(): string {
  return randomBytes(32).toString('hex');
}

export function initializeSharedAuth(options?: {
  token?: string;
  rotationIntervalMs?: number;
  enabled?: boolean;
}): void {
  const token = options?.token ?? generateSharedToken();
  const enabled = options?.enabled ?? true;

  sharedAuthState = {
    token,
    tokenHash: hashToken(token),
    tokenCreatedAt: Date.now(),
    tokenExpiresAt: options?.rotationIntervalMs
      ? Date.now() + options.rotationIntervalMs
      : null,
    rotationIntervalMs: options?.rotationIntervalMs ?? 86400000,
    enabled,
  };

  logger.info(
    `[Gateway] Shared auth initialized (enabled=${enabled}, rotation=${sharedAuthState.rotationIntervalMs}ms)`,
  );
}

export function getSharedAuthToken(): string | null {
  if (!sharedAuthState.enabled) return null;
  return sharedAuthState.token;
}

export function getSharedAuthTokenHash(): string | null {
  if (!sharedAuthState.enabled) return null;
  return sharedAuthState.tokenHash;
}

export function validateSharedToken(token: string): boolean {
  if (!sharedAuthState.enabled || !sharedAuthState.tokenHash) {
    return false;
  }

  const providedHash = hashToken(token);
  return providedHash === sharedAuthState.tokenHash;
}

export function rotateSharedToken(): string {
  const newToken = generateSharedToken();
  const now = Date.now();

  sharedAuthState.token = newToken;
  sharedAuthState.tokenHash = hashToken(newToken);
  sharedAuthState.tokenCreatedAt = now;
  sharedAuthState.tokenExpiresAt = now + sharedAuthState.rotationIntervalMs;

  logger.info('[Gateway] Shared auth token rotated');

  return newToken;
}

export function isSharedTokenExpired(): boolean {
  if (!sharedAuthState.tokenExpiresAt) return false;
  return Date.now() > sharedAuthState.tokenExpiresAt;
}

export function getSharedAuthState(): Readonly<SharedAuthState> {
  return { ...sharedAuthState };
}

export function enableSharedAuth(): void {
  if (!sharedAuthState.token) {
    initializeSharedAuth();
  }
  sharedAuthState.enabled = true;
}

export function disableSharedAuth(): void {
  sharedAuthState.enabled = false;
}

export function bindSessionToSharedAuth(params: {
  sessionKey: string;
  token: string;
  expiresInMs?: number;
}): boolean {
  if (!validateSharedToken(params.token)) {
    return false;
  }

  const binding: SharedAuthSessionBinding = {
    sessionKey: params.sessionKey,
    tokenHash: sharedAuthState.tokenHash!,
    boundAt: Date.now(),
    expiresAt: params.expiresInMs ? Date.now() + params.expiresInMs : undefined,
  };

  sessionBindings.set(params.sessionKey, binding);
  return true;
}

export function unbindSessionFromSharedAuth(sessionKey: string): void {
  sessionBindings.delete(sessionKey);
}

export function isSessionBoundToSharedAuth(sessionKey: string): boolean {
  const binding = sessionBindings.get(sessionKey);
  if (!binding) return false;
  if (binding.expiresAt && Date.now() > binding.expiresAt) {
    sessionBindings.delete(sessionKey);
    return false;
  }
  return binding.tokenHash === sharedAuthState.tokenHash;
}

export function cleanupExpiredSessionBindings(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, binding] of sessionBindings.entries()) {
    if (binding.expiresAt && now > binding.expiresAt) {
      sessionBindings.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

export function clearSharedAuthForTests(): void {
  sharedAuthState = {
    token: null,
    tokenHash: null,
    tokenCreatedAt: null,
    tokenExpiresAt: null,
    rotationIntervalMs: 86400000,
    enabled: false,
  };
  sessionBindings.clear();
}
