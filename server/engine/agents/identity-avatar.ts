/**
 * Ported from openclaw/src/agents/identity-avatar.ts
 *
 * Resolves public avatar sources for configured agent identities.
 * Cross-wms degradation: simplified without file system / avatar policy checks.
 */

export type AgentAvatarResolution =
  | { kind: "none"; reason: string; source?: string }
  | { kind: "local"; filePath: string; source: string }
  | { kind: "remote"; url: string; source: string }
  | { kind: "data"; url: string; source: string };

/** Return a safe public description of the configured avatar source. */
export function resolvePublicAgentAvatarSource(
  resolved: { kind: AgentAvatarResolution["kind"]; source?: string | null },
): string | undefined {
  const source = typeof resolved.source === "string" ? resolved.source : null;
  if (!source) {
    return undefined;
  }
  // For HTTP/data URLs, return a sanitized description.
  if (source.startsWith("http://") || source.startsWith("https://")) {
    return "remote URL";
  }
  if (source.startsWith("data:")) {
    const commaIndex = source.indexOf(",");
    const header = commaIndex > 0 ? source.slice(0, Math.min(commaIndex, 64)) : source.slice(0, 64);
    return `${header},...`;
  }
  // For local paths, only return if it's a safe relative path.
  if (source.startsWith("/") || source.startsWith("~") || source.includes("..")) {
    return undefined;
  }
  return source;
}

/** Resolve the effective avatar for an agent, including config and IDENTITY.md. */
export function resolveAgentAvatar(
  cfg: Record<string, unknown>,
  agentId: string,
  opts?: { includeUiOverride?: boolean },
): AgentAvatarResolution {
  // Cross-wms does not have agent identity / workspace avatar resolution.
  // Check config for a simple avatar URL.
  const ui = cfg.ui as Record<string, unknown> | undefined;
  const assistant = ui?.assistant as Record<string, unknown> | undefined;
  const avatar = typeof assistant?.avatar === "string" ? assistant.avatar : undefined;

  if (!avatar) {
    return { kind: "none", reason: "missing" };
  }
  if (avatar.startsWith("http://") || avatar.startsWith("https://")) {
    return { kind: "remote", url: avatar, source: avatar };
  }
  if (avatar.startsWith("data:")) {
    return { kind: "data", url: avatar, source: avatar };
  }
  return { kind: "none", reason: "unsupported", source: avatar };
}
