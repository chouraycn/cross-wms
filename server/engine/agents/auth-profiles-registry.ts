import { z } from 'zod';
import { logger } from '../../logger.js';

export const AuthProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  type: z.enum(['api_key', 'oauth', 'bearer', 'basic', 'custom']),
  credentials: z.record(z.string(), z.unknown()),
  scopes: z.array(z.string()).default([]),
  expiresAt: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type AuthProfile = z.infer<typeof AuthProfileSchema>;

const profileStore = new Map<string, AuthProfile>();

export function registerAuthProfile(profile: Omit<AuthProfile, 'createdAt' | 'updatedAt'>): AuthProfile {
  const now = Date.now();
  const fullProfile: AuthProfile = {
    ...profile,
    createdAt: now,
    updatedAt: now,
  };
  
  const result = AuthProfileSchema.safeParse(fullProfile);
  if (!result.success) {
    logger.error(`[Agents:AuthProfiles] Invalid auth profile: ${result.error.message}`);
    throw new Error(`Invalid auth profile: ${result.error.message}`);
  }
  
  profileStore.set(profile.id, result.data);
  logger.debug(`[Agents:AuthProfiles] Registered auth profile: ${profile.id}`);
  return result.data;
}

export function updateAuthProfile(id: string, updates: Partial<AuthProfile>): AuthProfile | undefined {
  const existing = profileStore.get(id);
  if (!existing) return undefined;
  
  const updated: AuthProfile = {
    ...existing,
    ...updates,
    id,
    updatedAt: Date.now(),
  };
  
  const result = AuthProfileSchema.safeParse(updated);
  if (!result.success) {
    logger.error(`[Agents:AuthProfiles] Invalid update for ${id}: ${result.error.message}`);
    throw new Error(`Invalid auth profile update: ${result.error.message}`);
  }
  
  profileStore.set(id, result.data);
  logger.debug(`[Agents:AuthProfiles] Updated auth profile: ${id}`);
  return result.data;
}

export function getAuthProfile(id: string): AuthProfile | undefined {
  return profileStore.get(id);
}

export function listAuthProfiles(): AuthProfile[] {
  return Array.from(profileStore.values());
}

export function deleteAuthProfile(id: string): boolean {
  const existed = profileStore.has(id);
  if (existed) {
    profileStore.delete(id);
    logger.debug(`[Agents:AuthProfiles] Deleted auth profile: ${id}`);
  }
  return existed;
}

export function getAuthProfilesByProvider(provider: string): AuthProfile[] {
  return listAuthProfiles().filter(p => p.provider === provider);
}

export function isAuthProfileValid(profile: AuthProfile): boolean {
  if (profile.expiresAt && profile.expiresAt < Date.now()) {
    return false;
  }
  return true;
}

export function clearAuthProfiles(): void {
  profileStore.clear();
}
