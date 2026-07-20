/**
 * Ported from openclaw/src/agents/embedded-agent-runner/history.ts
 *
 * Limits embedded-agent history length from session-key policy.
 */

const THREAD_SUFFIX_REGEX = /^(.*)(?::(?:thread|topic):\d+)$/i;

function stripThreadSuffix(value: string): string {
  const match = value.match(THREAD_SUFFIX_REGEX);
  return match?.[1] ?? value;
}

/**
 * Limits conversation history to the last N user turns (and their associated
 * assistant responses). This reduces token usage for long-running DM sessions.
 */
export function limitHistoryTurns(
  messages: Array<{ role: string; [key: string]: unknown }>,
  limit: number | undefined,
): Array<{ role: string; [key: string]: unknown }> {
  if (!limit || limit <= 0 || messages.length === 0) {
    return messages;
  }

  let userCount = 0;
  let lastUserIndex = messages.length;

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userCount++;
      if (userCount > limit) {
        return messages.slice(lastUserIndex);
      }
      lastUserIndex = i;
    }
  }
  return messages;
}

/**
 * Extract provider + user ID from a session key and look up dmHistoryLimit.
 * Cross-wms degradation: simplified without provider-id normalization.
 */
export function getHistoryLimitFromSessionKey(
  sessionKey: string | undefined,
  config: Record<string, unknown> | undefined,
): number | undefined {
  if (!sessionKey || !config) {
    return undefined;
  }

  const parts = sessionKey.split(":").filter(Boolean);
  const providerParts = parts.length >= 3 && parts[0] === "agent" ? parts.slice(2) : parts;
  const provider = providerParts[0]?.trim().toLowerCase() ?? "";
  if (!provider) {
    return undefined;
  }

  const kind = providerParts[1]?.trim().toLowerCase();
  const userIdRaw = providerParts.slice(2).join(":");
  const userId = stripThreadSuffix(userIdRaw);

  const channels = config.channels as Record<string, unknown> | undefined;
  if (!channels || typeof channels !== "object") {
    return undefined;
  }

  let providerConfig: Record<string, unknown> | undefined;
  for (const [configuredProviderId, value] of Object.entries(channels)) {
    if (configuredProviderId.trim().toLowerCase() !== provider) {
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    providerConfig = value as Record<string, unknown>;
    break;
  }
  if (!providerConfig) {
    return undefined;
  }

  // For DM sessions: per-DM override -> dmHistoryLimit.
  if (kind === "dm" || kind === "direct") {
    const dms = providerConfig.dms as Record<string, { historyLimit?: number }> | undefined;
    if (userId && dms?.[userId]?.historyLimit !== undefined) {
      return dms[userId].historyLimit;
    }
    return providerConfig.dmHistoryLimit as number | undefined;
  }

  // For channel/group sessions: use historyLimit from provider config.
  if (kind === "channel" || kind === "group") {
    return providerConfig.historyLimit as number | undefined;
  }

  return undefined;
}
