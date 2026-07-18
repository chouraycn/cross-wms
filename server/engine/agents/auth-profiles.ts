import { logger } from '../../logger.js';
import {
  registerAuthProfile,
  updateAuthProfile,
  getAuthProfile,
  listAuthProfiles,
  deleteAuthProfile,
  getAuthProfilesByProvider,
  isAuthProfileValid,
  clearAuthProfiles,
} from './auth-profiles-registry.js';
import {
  setSessionAuthOverride,
  getSessionAuthOverride,
  clearSessionAuthOverride,
  applySessionOverride,
  listSessionAuthOverrides,
  cleanupExpiredOverrides,
} from './auth-profiles-session-override.js';

export type { AuthProfile } from './auth-profiles-registry.js';
export { AuthProfileSchema } from './auth-profiles-registry.js';
export type { SessionAuthOverride } from './auth-profiles-session-override.js';

export function createAuthProfile(params: {
  id: string;
  name: string;
  provider: string;
  type: 'api_key' | 'oauth' | 'bearer' | 'basic' | 'custom';
  credentials: Record<string, unknown>;
  scopes?: string[];
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}) {
  return registerAuthProfile({
    id: params.id,
    name: params.name,
    provider: params.provider,
    type: params.type,
    credentials: params.credentials,
    scopes: params.scopes ?? [],
    expiresAt: params.expiresAt,
    metadata: params.metadata ?? {},
  });
}

export function getEffectiveAuthProfile(profileId: string, sessionId?: string) {
  const profile = getAuthProfile(profileId);
  if (!profile) return undefined;
  
  if (sessionId) {
    return applySessionOverride(profile, sessionId);
  }
  
  return profile;
}

export function validateAuthProfile(profileId: string): boolean {
  const profile = getAuthProfile(profileId);
  if (!profile) return false;
  return isAuthProfileValid(profile);
}

export function refreshAuthProfile(profileId: string, credentials: Record<string, unknown>, expiresAt?: number) {
  return updateAuthProfile(profileId, {
    credentials,
    expiresAt,
  });
}

export {
  registerAuthProfile,
  updateAuthProfile,
  getAuthProfile,
  listAuthProfiles,
  deleteAuthProfile,
  getAuthProfilesByProvider,
  isAuthProfileValid,
  clearAuthProfiles,
  setSessionAuthOverride,
  getSessionAuthOverride,
  clearSessionAuthOverride,
  applySessionOverride,
  listSessionAuthOverrides,
  cleanupExpiredOverrides,
};

logger.debug('[Agents:AuthProfiles] Module loaded');
