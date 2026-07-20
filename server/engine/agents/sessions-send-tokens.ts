/**
 * 移植自 openclaw/src/agents/tools/sessions-send-tokens.ts
 *
 * sessions_send sentinel tokens. Defines non-deliverable reply markers
 * used by sessions_send and subagent completion delivery.
 */

/** Suppresses a subagent completion announcement. */
export const ANNOUNCE_SKIP_TOKEN = "ANNOUNCE_SKIP";
/** Suppresses a direct reply delivery. */
export const REPLY_SKIP_TOKEN = "REPLY_SKIP";

/** Silent reply token from auto-reply subsystem. */
const SILENT_REPLY_TOKEN = "SILENT_REPLY";
/** Heartbeat token from auto-reply subsystem. */
const HEARTBEAT_TOKEN = "HEARTBEAT";

const NON_DELIVERABLE_REPLY_TOKENS = [
  ANNOUNCE_SKIP_TOKEN,
  REPLY_SKIP_TOKEN,
  SILENT_REPLY_TOKEN,
  HEARTBEAT_TOKEN,
] as const;

/** Returns true when text is exactly the announce-skip sentinel. */
export function isAnnounceSkip(text?: string): boolean {
  return (text ?? "").trim() === ANNOUNCE_SKIP_TOKEN;
}

/** Returns true when text is exactly the reply-skip sentinel. */
export function isReplySkip(text?: string): boolean {
  return (text ?? "").trim() === REPLY_SKIP_TOKEN;
}

/** Returns true when text is any non-deliverable sessions reply sentinel. */
export function isNonDeliverableSessionsReply(text?: string): boolean {
  const trimmed = (text ?? "").trim();
  return NON_DELIVERABLE_REPLY_TOKENS.includes(trimmed as typeof NON_DELIVERABLE_REPLY_TOKENS[number]);
}
