/**
 * 移植自 openclaw/src/agents/live-model-switch.ts
 *
 * Resolves and persists live-session model switch requests.
 * cross-wms provides simplified implementations since the session store
 * infrastructure is not available.
 */

export { LiveSessionModelSwitchError } from "./live-model-switch-error.js";

/** A resolved model selection for a live session. */
export type LiveSessionModelSelection = {
  provider: string;
  model: string;
  authProfileId?: string;
  authProfileIdSource?: "auto" | "user";
};

/**
 * Resolve the persisted model selection for a live session.
 * Returns null in cross-wms since session store is not available.
 */
export function resolveLiveSessionModelSelection(_params: {
  cfg?: unknown;
  sessionKey?: string;
  agentId?: string;
  defaultProvider: string;
  defaultModel: string;
}): LiveSessionModelSelection | null {
  // cross-wms lacks session store; no persisted model selection.
  return null;
}

/** Check whether the next model selection differs from the current running model. */
export function hasDifferentLiveSessionModelSelection(
  current: {
    provider: string;
    model: string;
    authProfileId?: string;
    authProfileIdSource?: string;
  },
  next: LiveSessionModelSelection | null | undefined,
): next is LiveSessionModelSelection {
  if (!next) {
    return false;
  }
  const currentAuthProfileId = typeof current.authProfileId === "string" ? current.authProfileId.trim() : undefined;
  const nextAuthProfileId = next.authProfileId;
  return (
    current.provider !== next.provider ||
    current.model !== next.model ||
    currentAuthProfileId !== nextAuthProfileId
  );
}

/**
 * Check whether a user-initiated live model switch is pending.
 * Returns undefined in cross-wms since session store is not available.
 */
export function shouldSwitchToLiveModel(_params: {
  cfg?: unknown;
  sessionKey?: string;
  agentId?: string;
  defaultProvider: string;
  defaultModel: string;
  currentProvider: string;
  currentModel: string;
  currentAuthProfileId?: string;
  currentAuthProfileIdSource?: string;
}): LiveSessionModelSelection | undefined {
  // cross-wms lacks session store; no pending model switch.
  return undefined;
}

/** Clear the liveModelSwitchPending flag — no-op in cross-wms. */
export async function clearLiveModelSwitchPending(_params: {
  cfg?: unknown;
  sessionKey?: string;
  agentId?: string;
}): Promise<void> {
  // cross-wms lacks session store; nothing to clear.
}
