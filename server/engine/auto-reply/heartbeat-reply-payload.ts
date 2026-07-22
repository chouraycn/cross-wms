/**
 * Heartbeat reply payload selector for multi-payload auto-reply results.
 *
 * Ported from openclaw/src/auto-reply/heartbeat-reply-payload.ts. The OpenClaw
 * plugin-sdk helpers (`hasOutboundReplyContent`, `isReasoningReplyPayload`)
 * are inlined so the module stays self-contained.
 */
import type { ReplyPayload } from './reply-payload.js';

const REASONING_PREFIX_RE = /^(?:reasoning:|thinking\.{0,3}(?=\s*(?:>\s*)?_))/u;

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : '';
}

function trimLeadingMarkdownQuoteMarkers(text: string): string {
  let candidate = text.trimStart();
  while (candidate.startsWith('>')) {
    candidate = candidate.replace(/^(?:>[ \t]?)+/, '').trimStart();
  }
  return candidate;
}

/** Detect reasoning replies from explicit flags or common reasoning text prefixes. */
function isReasoningReplyPayload(payload: {
  text?: string;
  isReasoning?: boolean;
}): boolean {
  if (payload.isReasoning === true) return true;
  const text = payload.text;
  if (typeof text !== 'string') return false;
  const normalized = normalizeLowercaseStringOrEmpty(text.trimStart());
  if (REASONING_PREFIX_RE.test(normalized)) return true;
  const unquoted = normalizeLowercaseStringOrEmpty(trimLeadingMarkdownQuoteMarkers(text));
  return REASONING_PREFIX_RE.test(unquoted);
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Check whether an outbound payload includes any sendable text, media, or rich reply content. */
function hasOutboundReplyContent(payload: {
  text?: string;
  mediaUrls?: string[];
  mediaUrl?: string;
  presentation?: unknown;
  interactive?: unknown;
  channelData?: unknown;
}): boolean {
  const text = normalizeOptionalString(payload.text);
  const mediaUrl = normalizeOptionalString(payload.mediaUrl);
  return Boolean(
    text ||
      mediaUrl ||
      payload.mediaUrls?.some((entry) => Boolean(normalizeOptionalString(entry))) ||
      (payload.presentation != null && typeof payload.presentation === 'object') ||
      (payload.interactive != null && typeof payload.interactive === 'object') ||
      payload.channelData != null,
  );
}

/**
 * Pick the last outbound-capable reply payload for heartbeat delivery.
 *
 * Reasoning payloads are skipped so a trailing reasoning payload (which
 * reasoning models can emit after the final answer) is not selected as the
 * user-visible heartbeat reply. Heartbeat reasoning is delivered separately
 * and only when `includeReasoning` is enabled.
 */
export function resolveHeartbeatReplyPayload(
  replyResult: ReplyPayload | ReplyPayload[] | undefined,
): ReplyPayload | undefined {
  if (!replyResult) return undefined;
  if (!Array.isArray(replyResult)) {
    // Scalar results can be reasoning-only too; without this guard a scalar
    // reasoning payload becomes the user-visible reply while the array path
    // filters it, so the leak depends on the result shape.
    return isReasoningReplyPayload(replyResult) ? undefined : replyResult;
  }
  for (let idx = replyResult.length - 1; idx >= 0; idx -= 1) {
    const payload = replyResult[idx];
    if (!payload) continue;
    if (isReasoningReplyPayload(payload)) continue;
    if (hasOutboundReplyContent(payload)) return payload;
  }
  return undefined;
}
