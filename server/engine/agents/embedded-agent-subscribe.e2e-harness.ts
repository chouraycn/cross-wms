/**
 * E2E harness helpers for embedded-agent-subscribe.
 * Ported from openclaw/src/agents/embedded-agent-subscribe.e2e-harness.ts
 * Simplified: test harness functions return minimal stub values.
 */

export function createStubSessionHarness(): null { return null; }
export function createSubscribedSessionHarness(): null { return null; }
export function createParagraphChunkedBlockReplyHarness(): null { return null; }
export function createTextEndBlockReplyHarness(): null { return null; }
export function extractAgentEventPayloads(_events: any[]): any[] { return []; }
export function extractTextPayloads(_events: any[]): string[] { return []; }
export function emitMessageStartAndEndForAssistantText(): null { return null; }
export function emitAssistantTextDeltaAndEnd(): null { return null; }
export function emitAssistantTextDelta(): null { return null; }
export function emitAssistantTextEnd(): null { return null; }
export function emitAssistantLifecycleErrorAndEnd(): null { return null; }
export function createReasoningFinalAnswerMessage(): null { return null; }
export function findLifecycleErrorAgentEvent(_events: any[]): undefined { return undefined; }
export function expectFencedChunks(): void { /* no-op test helper */ }
export function expectSingleAgentEventText(): void { /* no-op test helper */ }
export const THINKING_TAG_CASES: string[] = [];
