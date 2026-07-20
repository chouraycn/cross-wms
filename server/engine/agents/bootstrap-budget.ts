/**
 * Bootstrap budget analysis helpers.
 * Ported from openclaw/src/agents/bootstrap-budget.ts
 * Simplified: budget analysis replaced with no-op defaults.
 */

export function resolveBootstrapWarningSignaturesSeen(): string[] { return []; }
export function buildBootstrapInjectionStats(): null { return null; }
export function analyzeBootstrapBudget(): null { return null; }
export function buildBootstrapPromptWarning(): string { return ""; }
export function appendBootstrapPromptWarning(prompt: string): string { return prompt; }
export function buildBootstrapPromptWarningNotice(): string { return ""; }
export function buildBootstrapTruncationReportMeta(): null { return null; }
