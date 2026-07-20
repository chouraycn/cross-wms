/**
 * Attempt execution helpers.
 * Ported from openclaw/src/agents/command/attempt-execution.helpers.ts
 * Simplified: session file helpers replaced with default values.
 */

export function sessionFileHasContent(): boolean { return false; }
export function claudeCliSessionTranscriptPath(sessionKey: string): string { return sessionKey; }
export function claudeCliSessionTranscriptHasContent(): boolean { return false; }
export function claudeCliSessionTranscriptHasOrphanedToolUse(): boolean { return false; }
export function resolveFallbackRetryPrompt(error: unknown): string { return String(error ?? ""); }
export function formatClaudeCliFallbackPrelude(): string { return ""; }
export function buildClaudeCliFallbackContextPrelude(): string { return ""; }
export function createAcpVisibleTextAccumulator(): { addText: (text: string) => void; getText: () => string } {
  let text = "";
  return {
    addText: (t: string) => { text += t; },
    getText: () => text,
  };
}
