/**
 * 移植自 openclaw/src/agents/tool-policy-audit.ts
 *
 * Tool policy audit logging helpers.
 * In cross-wms the subsystem logger and policy match helpers are not available,
 * so both functions degrade to silent no-ops.
 */

/** Log level used for tool-policy audit events. */
export type ToolPolicyAuditLogLevel = "info" | "debug";

/** Log tools removed by an allow/deny policy filter step (no-op in cross-wms). */
export function auditToolPolicyFilter(..._args: unknown[]): void {
  // No-op: audit logging requires subsystem logger + policy match helpers
  // that are not available in cross-wms.
}

/** Log a sandbox tool blocked by policy before execution (no-op in cross-wms). */
export function auditSandboxToolPolicyBlock(..._args: unknown[]): void {
  // No-op: audit logging requires subsystem logger + policy match helpers
  // that are not available in cross-wms.
}
