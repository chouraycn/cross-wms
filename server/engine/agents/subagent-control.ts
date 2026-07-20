/**
 * Subagent control and lifecycle management.
 * Ported from openclaw/src/agents/subagent-control.ts
 * Simplified: subagent process management replaced with no-op defaults.
 */

export type ResolvedSubagentController = unknown;
export const DEFAULT_RECENT_MINUTES = 5;
export const MAX_RECENT_MINUTES = 60;
export const testing = {};

export function resolveSubagentController(): null { return null; }
export function listControlledSubagentRuns(): unknown[] { return []; }
export async function killAllControlledSubagentRuns(): Promise<number> { return 0; }
export async function killControlledSubagentRun(): Promise<boolean> { return false; }
export async function killSubagentRunAdmin(): Promise<boolean> { return false; }
export async function steerControlledSubagentRun(): Promise<boolean> { return false; }
export async function sendControlledSubagentMessage(): Promise<boolean> { return false; }
