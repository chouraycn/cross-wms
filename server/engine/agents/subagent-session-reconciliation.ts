/**
 * Subagent session reconciliation helpers.
 * Ported from openclaw/src/agents/subagent-session-reconciliation.ts
 * Simplified: session reconciliation replaced with default values.
 */

export type SubagentSessionStoreCache = unknown;
export type SubagentRunOrphanReason = "parent-exited" | "parent-reset" | "session-expired" | "unknown";
export type SubagentSessionCompletion = "completed" | "error" | "aborted" | "in-progress";

export function loadSubagentSessionEntry(): undefined { return undefined; }
export function resolveSubagentRunOrphanReason(): SubagentRunOrphanReason { return "unknown"; }
export function resolveCompletionFromSessionEntry(): SubagentSessionCompletion { return "in-progress"; }
export function resolveSubagentSessionCompletion(): SubagentSessionCompletion { return "in-progress"; }
export function resolveSubagentSessionStartedAt(): number { return Date.now(); }
