/**
 * 移植自 openclaw/src/agents/tools/sessions-resolution.ts
 *
 * Session key resolution helpers for sub-agent sessions.
 * Simplified for cross-wms: no gateway session store lookup.
 */

/** Resolve a session key from a session reference. */
export function resolveSessionKey(params: {
  sessionRef?: string;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
}): string | undefined {
  const sessionKey = params.sessionKey?.trim();
  if (sessionKey) {
    return sessionKey;
  }
  const sessionRef = params.sessionRef?.trim();
  if (sessionRef) {
    if (sessionRef.includes("/")) {
      return sessionRef;
    }
    const agentId = params.agentId?.trim();
    if (agentId) {
      return `${agentId}/${sessionRef}`;
    }
    return sessionRef;
  }
  const sessionId = params.sessionId?.trim();
  if (sessionId) {
    const agentId = params.agentId?.trim();
    if (agentId) {
      return `${agentId}/${sessionId}`;
    }
    return sessionId;
  }
  return undefined;
}

/** Parse a session key into agent ID and session ID components. */
export function parseSessionKey(sessionKey: string): {
  agentId: string;
  sessionId: string;
} | undefined {
  const trimmed = sessionKey.trim();
  if (!trimmed) {
    return undefined;
  }
  const separator = trimmed.indexOf("/");
  if (separator < 0) {
    return { agentId: "", sessionId: trimmed };
  }
  return {
    agentId: trimmed.slice(0, separator),
    sessionId: trimmed.slice(separator + 1),
  };
}

/** Resolve the agent ID from a session key. */
export function resolveAgentIdFromSessionKey(sessionKey: string): string {
  const parsed = parseSessionKey(sessionKey);
  return parsed?.agentId ?? "";
}

/** Check if a session key refers to a sub-agent session. */
export function isSubagentSessionKey(sessionKey: string): boolean {
  const parsed = parseSessionKey(sessionKey);
  if (!parsed) {
    return false;
  }
  return parsed.agentId !== "" && parsed.agentId !== "main";
}

/** Check if a session key refers to a cron session. */
export function isCronSessionKey(sessionKey: string): boolean {
  const trimmed = sessionKey.trim().toLowerCase();
  return trimmed.startsWith("cron/") || trimmed.includes(":cron:");
}

/** Check if a session key refers to an ACP session. */
export function isAcpSessionKey(sessionKey: string): boolean {
  const trimmed = sessionKey.trim().toLowerCase();
  return trimmed.startsWith("acp/") || trimmed.includes(":acp:");
}

/** Build a session key for a sub-agent session. */
export function buildSubagentSessionKey(params: {
  agentId: string;
  sessionId: string;
}): string {
  return `${params.agentId.trim()}/${params.sessionId.trim()}`;
}

/** Build a session key for a cron session. */
export function buildCronSessionKey(params: {
  agentId: string;
  cronId: string;
}): string {
  return `cron/${params.agentId.trim()}/${params.cronId.trim()}`;
}
