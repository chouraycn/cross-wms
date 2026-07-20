/**
 * Subagent registry announce and read helpers.
 * Ported from openclaw/src/agents/subagent-registry-announce-read.ts
 * Simplified: session lookup replaced with empty defaults.
 */

export function resolveRequesterForChildSession(): undefined { return undefined; }
export function isSubagentSessionRunActive(): boolean { return false; }
export function shouldIgnorePostCompletionAnnounceForSession(): boolean { return false; }
export function listSubagentRunsForRequester(): unknown[] { return []; }
export function countPendingDescendantRuns(): number { return 0; }
export function countPendingDescendantRunsExcludingRun(): number { return 0; }
