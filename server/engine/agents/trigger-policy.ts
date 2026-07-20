/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/run/trigger-policy.ts
 *
 * Heartbeat trigger policy.
 * In cross-wms the trigger policy infrastructure is not available,
 * so shouldInjectHeartbeatPromptForTrigger returns false.
 */

/** Whether to inject a heartbeat prompt for the given trigger (always false in cross-wms). */
export function shouldInjectHeartbeatPromptForTrigger(..._args: unknown[]): false {
  return false;
}
