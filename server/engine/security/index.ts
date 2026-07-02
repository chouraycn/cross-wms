/**
 * 安全模块 barrel 文件（组织性）。
 * 本文件仅用于聚合 re-export 父目录中的安全、沙箱、密钥与审批相关模块，便于以
 * `engine/security` 子路径统一引用；不移动或修改任何现有文件。
 *
 * 说明：以下模块存在重名导出，已对后出现者改用具名 re-export 并排除冲突名：
 * - toolPolicyEngine 与 toolPolicy 在 ToolPolicyRule 上重名（由 toolPolicy 提供）。
 * - executionApproval 与 approvalManager 在 ApprovalRequest / ApprovalStatus 上重名
 *   （由 approvalManager 提供）。
 */
export * from '../sandboxPolicy.js';
export * from '../toolPolicy.js';
export {
  ToolRiskLevel,
  ToolRateLimit,
  ToolPolicyEvaluationResult,
  ToolPolicyEvaluationContext,
  ToolPolicyEngine,
} from '../toolPolicyEngine.js';
export * from '../approvalManager.js';
export * from '../crypto.js';
export * from '../deviceAuth.js';
export * from '../authProfilePool.js';
export {
  ApprovalLevel,
  ApprovalRequestType,
  ApprovalResult,
  ApprovalPolicy,
  getExecutionApproval,
  requestExecutionApproval,
  approveExecution,
  denyExecution,
  resetExecutionApprovalForTests,
} from '../executionApproval.js';
export type { ExecutionApprovalManager } from '../executionApproval.js';
export * from '../secretsManager.js';
export * from '../secretsRuntime.js';
export * from '../secretsStore.js';
export * from '../secretsTypes.js';
