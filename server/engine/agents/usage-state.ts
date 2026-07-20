/**
 * Pure cooldown and unusable-window helpers for auth profile usage state.
 * Ported from openclaw/src/agents/auth-profiles/usage-state.ts
 * Simplified: normalizeProviderId and asDateTimestampMs replaced with inline logic.
 */

type AuthProfileFailureReason =
  | "auth"
  | "billing"
  | "rate_limit"
  | "timeout"
  | "server_error"
  | "format";

type ProfileUsageStats = {
  blockedUntil?: number;
  blockedReason?: string;
  blockedSource?: string;
  blockedModel?: string;
  cooldownUntil?: number;
  cooldownReason?: AuthProfileFailureReason;
  cooldownModel?: string;
  disabledUntil?: number;
  disabledReason?: string;
  errorCount?: number;
  failureCounts?: Record<string, number>;
  lastFailureAt?: number;
};

type AuthProfileStore = {
  profiles: Record<string, { provider?: string }>;
  usageStats?: Record<string, ProfileUsageStats>;
};

function normalizeProviderId(provider: string): string {
  return provider.trim().toLowerCase();
}

function asDateTimestampMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getTime();
  }
  return undefined;
}

/** Returns true for providers whose auth-profile cooldowns are provider-managed. */
export function isAuthCooldownBypassedForProvider(provider: string | undefined): boolean {
  const normalized = normalizeProviderId(provider ?? "");
  return normalized === "openrouter" || normalized === "kilocode";
}

/** Returns true when a failure should only cool down the failing model. */
export function isModelScopedCooldownReason(reason: AuthProfileFailureReason | undefined): boolean {
  return reason === "rate_limit" || reason === "timeout";
}

/** Resolves the latest active blocked/cooldown/disabled timestamp for a profile. */
export function resolveProfileUnusableUntil(
  stats: Pick<ProfileUsageStats, "blockedUntil" | "cooldownUntil" | "disabledUntil">,
): number | null {
  const values = [stats.blockedUntil, stats.cooldownUntil, stats.disabledUntil]
    .map((value) => asDateTimestampMs(value))
    .filter((value): value is number => value !== undefined && value > 0);
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}

/** Returns true when an unusable timestamp is active at the supplied clock time. */
export function isActiveUnusableWindow(until: number | undefined, now: number): boolean {
  const timestamp = asDateTimestampMs(until);
  return timestamp !== undefined && timestamp > 0 && now < timestamp;
}

function shouldBypassModelScopedCooldown(
  stats: Pick<
    ProfileUsageStats,
    "blockedUntil" | "cooldownReason" | "cooldownModel" | "disabledUntil"
  >,
  now: number,
  forModel?: string,
): boolean {
  return Boolean(
    forModel &&
    isModelScopedCooldownReason(stats.cooldownReason) &&
    stats.cooldownModel &&
    stats.cooldownModel !== forModel &&
    !isActiveUnusableWindow(stats.blockedUntil, now) &&
    !isActiveUnusableWindow(stats.disabledUntil, now),
  );
}

/** Check if a profile is currently in cooldown. */
export function isProfileInCooldown(
  store: AuthProfileStore,
  profileId: string,
  now?: number,
  forModel?: string,
): boolean {
  if (isAuthCooldownBypassedForProvider(store.profiles[profileId]?.provider)) {
    return false;
  }
  const stats = store.usageStats?.[profileId];
  if (!stats) {
    return false;
  }
  const ts = now ?? Date.now();
  if (shouldBypassModelScopedCooldown(stats, ts, forModel)) {
    return false;
  }
  const unusableUntil = resolveProfileUnusableUntil(stats);
  return unusableUntil ? ts < unusableUntil : false;
}

/** Return the soonest cooldown expiry timestamp among the given profiles. */
export function getSoonestCooldownExpiry(
  store: AuthProfileStore,
  profileIds: string[],
  options?: { now?: number; forModel?: string },
): number | null {
  const ts = options?.now ?? Date.now();
  let soonest: number | null = null;
  let latestMatchingModelCooldown: number | null = null;
  for (const id of profileIds) {
    const stats = store.usageStats?.[id];
    if (!stats) {
      continue;
    }
    if (shouldBypassModelScopedCooldown(stats, ts, options?.forModel)) {
      continue;
    }
    const until = resolveProfileUnusableUntil(stats);
    if (typeof until !== "number" || !Number.isFinite(until) || until <= 0) {
      continue;
    }
    const matchingModelScopedCooldown =
      options?.forModel &&
      stats.cooldownReason === "rate_limit" &&
      stats.cooldownModel === options.forModel &&
      !isActiveUnusableWindow(stats.blockedUntil, ts) &&
      !isActiveUnusableWindow(stats.disabledUntil, ts);
    if (matchingModelScopedCooldown) {
      latestMatchingModelCooldown =
        latestMatchingModelCooldown === null ? until : Math.max(latestMatchingModelCooldown, until);
      continue;
    }
    if (soonest === null || until < soonest) {
      soonest = until;
    }
  }
  if (soonest === null) {
    return latestMatchingModelCooldown;
  }
  if (latestMatchingModelCooldown === null) {
    return soonest;
  }
  return Math.min(soonest, latestMatchingModelCooldown);
}

/** Clear expired cooldowns from all profiles in the store. */
export function clearExpiredCooldowns(store: AuthProfileStore, now?: number): boolean {
  const usageStats = store.usageStats;
  if (!usageStats) {
    return false;
  }

  const ts = now ?? Date.now();
  let mutated = false;

  for (const [profileId, stats] of Object.entries(usageStats)) {
    if (!stats) {
      continue;
    }

    let profileMutated = false;
    const cooldownExpired =
      typeof stats.cooldownUntil === "number" &&
      Number.isFinite(stats.cooldownUntil) &&
      stats.cooldownUntil > 0 &&
      ts >= stats.cooldownUntil;
    const blockedExpired =
      typeof stats.blockedUntil === "number" &&
      Number.isFinite(stats.blockedUntil) &&
      stats.blockedUntil > 0 &&
      ts >= stats.blockedUntil;
    const disabledExpired =
      typeof stats.disabledUntil === "number" &&
      Number.isFinite(stats.disabledUntil) &&
      stats.disabledUntil > 0 &&
      ts >= stats.disabledUntil;

    if (cooldownExpired) {
      stats.cooldownUntil = undefined;
      stats.cooldownReason = undefined;
      stats.cooldownModel = undefined;
      profileMutated = true;
    }
    if (blockedExpired) {
      stats.blockedUntil = undefined;
      stats.blockedReason = undefined;
      stats.blockedSource = undefined;
      stats.blockedModel = undefined;
      profileMutated = true;
    }
    if (disabledExpired) {
      stats.disabledUntil = undefined;
      stats.disabledReason = undefined;
      profileMutated = true;
    }

    if (profileMutated && !resolveProfileUnusableUntil(stats)) {
      stats.errorCount = 0;
      stats.failureCounts = undefined;
    }

    if (profileMutated) {
      usageStats[profileId] = stats;
      mutated = true;
    }
  }

  return mutated;
}
