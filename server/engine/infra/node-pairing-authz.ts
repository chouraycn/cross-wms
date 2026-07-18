// 将节点配对命令声明映射到所需的 operator 范围。
import { NODE_SYSTEM_RUN_COMMANDS } from "./node-commands.js";

/** 批准待处理节点配对表面所需的 operator 范围。 */
export type NodeApprovalScope = "operator.pairing" | "operator.write" | "operator.admin";

const OPERATOR_PAIRING_SCOPE: NodeApprovalScope = "operator.pairing";
const OPERATOR_WRITE_SCOPE: NodeApprovalScope = "operator.write";
const OPERATOR_ADMIN_SCOPE: NodeApprovalScope = "operator.admin";

/** 将声明的节点命令映射到批准所需的最低 operator 范围。 */
export function resolveNodePairApprovalScopes(commands: unknown): NodeApprovalScope[] {
  const normalized = Array.isArray(commands)
    ? commands.filter((command): command is string => typeof command === "string")
    : [];
  if (
    normalized.some((command) => NODE_SYSTEM_RUN_COMMANDS.some((allowed) => allowed === command))
  ) {
    return [OPERATOR_PAIRING_SCOPE, OPERATOR_ADMIN_SCOPE];
  }
  if (normalized.length > 0) {
    return [OPERATOR_PAIRING_SCOPE, OPERATOR_WRITE_SCOPE];
  }
  return [OPERATOR_PAIRING_SCOPE];
}
