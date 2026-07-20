/**
 * 移植自 openclaw/src/agents/tools/nodes-tool-commands.ts
 *
 * Nodes command action executor.
 * In cross-wms the gateway infrastructure is not available,
 * so executeNodeCommandAction throws a clear unsupported error.
 */

/** Supported node command action types. */
export type NodeCommandAction =
  | "camera_list"
  | "notifications_list"
  | "device_status"
  | "device_info"
  | "device_permissions"
  | "device_health"
  | "notifications_action"
  | "location_get"
  | "invoke";

/** Execute a node command action (unsupported in cross-wms). */
export async function executeNodeCommandAction(params: {
  action: NodeCommandAction;
  input: Record<string, unknown>;
  gatewayOpts: unknown;
  allowMediaInvokeCommands?: boolean;
  mediaInvokeActions: Record<string, string>;
}): Promise<never> {
  throw new Error(`Node command action "${params.action}" is not supported in cross-wms`);
}
