/**
 * 移植自 openclaw/src/agents/embedded-agent-subscribe.tool-text-diagnostics.ts
 *
 * Tool text diagnostics for embedded agent subscriptions.
 * In cross-wms the full diagnostics infrastructure is not available,
 * so warnIfAssistantEmittedToolText is a no-op.
 */

/** Warn if the assistant emitted tool text (no-op in cross-wms). */
export function warnIfAssistantEmittedToolText(..._args: unknown[]): void {
  // No-op: tool text diagnostics not available in cross-wms.
}
