/**
 * Session send helpers for agent-to-agent messaging.
 * Ported from openclaw/src/agents/tools/sessions-send-helpers.ts
 * Simplified: message context resolution replaced with default values.
 */

export type AnnounceTarget = {
  channel?: string;
  to?: string;
  accountId?: string;
  threadId?: string | number;
};

export function resolveAnnounceTargetFromKey(): undefined { return undefined; }
export function buildAgentToAgentMessageContext(): null { return null; }
export function buildAgentToAgentReplyContext(): null { return null; }
export function buildAgentToAgentAnnounceContext(): null { return null; }
export function resolvePingPongTurns(): unknown[] { return []; }
