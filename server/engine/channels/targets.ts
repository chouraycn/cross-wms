import { logger } from '../../logger.js';
import { normalizeLowercaseStringOrEmpty } from "@cdf-know/normalization-core/string-coerce";

export type { DirectoryConfigParams } from "./plugins/directory-types.js";
export type { ChannelDirectoryEntry } from "./plugins/types.public.js";

export type ChannelTarget = {
  type: 'direct' | 'channel' | 'thread' | 'group';
  id: string;
  subId?: string;
};

export type TargetResolutionResult = {
  ok: boolean;
  target?: ChannelTarget;
  error?: string;
};

export function parseTarget(targetStr: string): TargetResolutionResult {
  if (!targetStr) {
    return { ok: false, error: 'Empty target' };
  }

  const parts = targetStr.split('/');
  const type = parts[0];

  if (type === 'dm' || type === 'direct') {
    return {
      ok: true,
      target: { type: 'direct', id: parts[1] ?? '' },
    };
  }

  if (type === 'channel') {
    return {
      ok: true,
      target: { type: 'channel', id: parts[1] ?? '', subId: parts[2] },
    };
  }

  if (type === 'thread') {
    return {
      ok: true,
      target: { type: 'thread', id: parts[1] ?? '', subId: parts[2] },
    };
  }

  if (type === 'group') {
    return {
      ok: true,
      target: { type: 'group', id: parts[1] ?? '' },
    };
  }

  logger.warn(`[Channels:Targets] Unknown target type: ${type}`);
  return { ok: false, error: `Unknown target type: ${type}` };
}

export function resolveTarget(target: ChannelTarget): string {
  switch (target.type) {
    case 'direct': return `dm/${target.id}`;
    case 'channel': return `channel/${target.id}${target.subId ? `/${target.subId}` : ''}`;
    case 'thread': return `thread/${target.id}${target.subId ? `/${target.subId}` : ''}`;
    case 'group': return `group/${target.id}`;
    default: return `${target.type}/${target.id}`;
  }
}

export function validateTarget(target: ChannelTarget): boolean {
  if (!target.id) return false;
  if (target.type === 'direct' || target.type === 'group') return true;
  if (target.type === 'channel' || target.type === 'thread') return true;
  return false;
}

// ============================================================================
// Messaging target parsing primitives (merged from openclaw/src/channels/targets.ts)
// Channel-specific grammars stay in plugins; this file owns common target shapes.
// ============================================================================

/** Canonical route target families shared by channel-owned parsers. */
export type MessagingTargetKind = "user" | "channel";

/** Parsed channel target with the original token and normalized lookup key. */
export type MessagingTarget = {
  kind: MessagingTargetKind;
  id: string;
  raw: string;
  normalized: string;
};

/** Options for parsers that can infer a kind or reject ambiguous input. */
export type MessagingTargetParseOptions = {
  defaultKind?: MessagingTargetKind;
  ambiguousMessage?: string;
};

/** Builds the stable lower-case lookup key used to compare channel targets. */
export function normalizeTargetId(kind: MessagingTargetKind, id: string): string {
  return normalizeLowercaseStringOrEmpty(`${kind}:${id}`);
}

/** Creates a parsed target while preserving the user-provided raw token. */
export function buildMessagingTarget(
  kind: MessagingTargetKind,
  id: string,
  raw: string,
): MessagingTarget {
  return {
    kind,
    id,
    raw,
    normalized: normalizeTargetId(kind, id),
  };
}

/** Validates an extracted target id with a channel-owned grammar. */
export function ensureTargetId(params: {
  candidate: string;
  pattern: RegExp;
  errorMessage: string;
}): string {
  if (!params.pattern.test(params.candidate)) {
    throw new Error(params.errorMessage);
  }
  return params.candidate;
}

/** Parses one mention pattern whose first capture group is the target id. */
export function parseTargetMention(params: {
  raw: string;
  mentionPattern: RegExp;
  kind: MessagingTargetKind;
}): MessagingTarget | undefined {
  const match = params.raw.match(params.mentionPattern);
  if (!match?.[1]) {
    return undefined;
  }
  return buildMessagingTarget(params.kind, match[1], params.raw);
}

/** Parses a single kind-prefixed target such as channel:<id> or user:<id>. */
export function parseTargetPrefix(params: {
  raw: string;
  prefix: string;
  kind: MessagingTargetKind;
}): MessagingTarget | undefined {
  if (!params.raw.startsWith(params.prefix)) {
    return undefined;
  }
  const id = params.raw.slice(params.prefix.length).trim();
  return id ? buildMessagingTarget(params.kind, id, params.raw) : undefined;
}

/** Parses the first matching kind-prefixed target from a channel grammar list. */
export function parseTargetPrefixes(params: {
  raw: string;
  prefixes: Array<{ prefix: string; kind: MessagingTargetKind }>;
}): MessagingTarget | undefined {
  for (const entry of params.prefixes) {
    const parsed = parseTargetPrefix({
      raw: params.raw,
      prefix: entry.prefix,
      kind: entry.kind,
    });
    if (parsed) {
      return parsed;
    }
  }
  return undefined;
}

/** Parses @user shorthand and validates it against a channel-owned user grammar. */
export function parseAtUserTarget(params: {
  raw: string;
  pattern: RegExp;
  errorMessage: string;
}): MessagingTarget | undefined {
  if (!params.raw.startsWith("@")) {
    return undefined;
  }
  const candidate = params.raw.slice(1).trim();
  const id = ensureTargetId({
    candidate,
    pattern: params.pattern,
    errorMessage: params.errorMessage,
  });
  return buildMessagingTarget("user", id, params.raw);
}

/** Tries mention, explicit prefixes, then @user shorthand in deterministic order. */
export function parseMentionPrefixOrAtUserTarget(params: {
  raw: string;
  mentionPattern: RegExp;
  prefixes: Array<{ prefix: string; kind: MessagingTargetKind }>;
  atUserPattern: RegExp;
  atUserErrorMessage: string;
}): MessagingTarget | undefined {
  const mentionTarget = parseTargetMention({
    raw: params.raw,
    mentionPattern: params.mentionPattern,
    kind: "user",
  });
  if (mentionTarget) {
    return mentionTarget;
  }
  const prefixedTarget = parseTargetPrefixes({
    raw: params.raw,
    prefixes: params.prefixes,
  });
  if (prefixedTarget) {
    return prefixedTarget;
  }
  return parseAtUserTarget({
    raw: params.raw,
    pattern: params.atUserPattern,
    errorMessage: params.atUserErrorMessage,
  });
}

/** Requires a parsed target of the requested kind and returns its channel id. */
export function requireTargetKind(params: {
  platform: string;
  target: MessagingTarget | undefined;
  kind: MessagingTargetKind;
}): string {
  const kindLabel = params.kind;
  if (!params.target) {
    throw new Error(`${params.platform} ${kindLabel} id is required.`);
  }
  if (params.target.kind !== params.kind) {
    throw new Error(`${params.platform} ${kindLabel} id is required (use ${kindLabel}:<id>).`);
  }
  return params.target.id;
}
