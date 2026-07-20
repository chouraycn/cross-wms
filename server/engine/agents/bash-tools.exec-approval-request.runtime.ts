/**
 * 移植自 openclaw/src/agents/bash-tools.exec-approval-request.runtime.ts
 *
 * Lazy runtime for exec approval command highlighting.
 * In cross-wms the command explainer infrastructure is not available,
 * so resolveExecApprovalCommandSpans returns undefined.
 */

/** Resolve command spans used to highlight exec approval prompts. */
export async function resolveExecApprovalCommandSpans(
  _command: string,
): Promise<undefined> {
  return undefined;
}
