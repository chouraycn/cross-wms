/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/attempt.tool-call-block-type.ts
 *
 * Tool call block type checker.
 * In cross-wms the tool call block type infrastructure is not available,
 * so isRunnerToolCallBlockType returns false.
 */

/** Check if a value is a runner tool call block type (returns false in cross-wms). */
export function isRunnerToolCallBlockType(..._args: unknown[]): false {
  return false;
}
