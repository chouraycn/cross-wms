import { logger } from '../../logger.js';
import type { AuthProfile } from './auth-profiles-registry.js';

export interface SessionAuthOverride {
  sessionId: string;
  profileId: string;
  overrides: Partial<AuthProfile>;
  createdAt: number;
  expiresAt?: number;
}

const sessionOverrideStore = new Map<string, SessionAuthOverride>();

export function setSessionAuthOverride(
  sessionId: string,
  profileId: string,
  overrides: Partial<AuthProfile>,
  expiresAt?: number,
): SessionAuthOverride {
  const override: SessionAuthOverride = {
    sessionId,
    profileId,
    overrides,
    createdAt: Date.now(),
    expiresAt,
  };
  
  sessionOverrideStore.set(sessionId, override);
  logger.debug(`[Agents:AuthProfiles] Set session override for session=${sessionId}, profile=${profileId}`);
  return override;
}

export function getSessionAuthOverride(sessionId: string): SessionAuthOverride | undefined {
  const override = sessionOverrideStore.get(sessionId);
  if (!override) return undefined;
  
  if (override.expiresAt && override.expiresAt < Date.now()) {
    sessionOverrideStore.delete(sessionId);
    logger.debug(`[Agents:AuthProfiles] Expired session override removed: ${sessionId}`);
    return undefined;
  }
  
  return override;
}

export function clearSessionAuthOverride(sessionId: string): boolean {
  const existed = sessionOverrideStore.has(sessionId);
  if (existed) {
    sessionOverrideStore.delete(sessionId);
    logger.debug(`[Agents:AuthProfiles] Cleared session override: ${sessionId}`);
  }
  return existed;
}

export function applySessionOverride(
  profile: AuthProfile,
  sessionId: string,
): AuthProfile {
  const override = getSessionAuthOverride(sessionId);
  if (!override || override.profileId !== profile.id) {
    return profile;
  }
  
  return {
    ...profile,
    ...override.overrides,
    updatedAt: Date.now(),
  };
}

export function listSessionAuthOverrides(): SessionAuthOverride[] {
  return Array.from(sessionOverrideStore.values());
}

export function cleanupExpiredOverrides(): number {
  let count = 0;
  const now = Date.now();
  
  for (const [sessionId, override] of sessionOverrideStore.entries()) {
    if (override.expiresAt && override.expiresAt < now) {
      sessionOverrideStore.delete(sessionId);
      count++;
    }
  }
  
  if (count > 0) {
    logger.debug(`[Agents:AuthProfiles] Cleaned up ${count} expired session overrides`);
  }
  
  return count;
}
