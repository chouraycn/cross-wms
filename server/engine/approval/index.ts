/**
 * Approval 模块统一导出
 *
 * 集中导出审计、多级审批链、策略引擎与单例。
 *
 * 子模块：
 * - approvalAudit  审批审计日志
 * - approvalChain  多级审批链
 * - approvalPolicy 配置化策略引擎
 */

export {
  ApprovalAudit,
  default as approvalAudit,
} from './approvalAudit.js';

export type {
  AuditEntry,
  AuditAction,
  AuditRiskLevel,
  AuditQueryFilter,
  AuditStats,
  ApprovalAuditConfig,
} from './approvalAudit.js';

export {
  ApprovalChain,
  default as approvalChain,
} from './approvalChain.js';

export type {
  ApprovalLevel,
  ApprovalRequestPayload,
  ChainStatus,
  ChainProgress,
  ChainResult,
  LevelResult,
  ApprovalChainConfig,
} from './approvalChain.js';

export {
  ApprovalPolicy,
  default as approvalPolicy,
} from './approvalPolicy.js';

export type {
  PolicyRule,
  PolicyAction,
  Condition,
  ConditionField,
  ConditionOperator,
  PolicyContext,
  PolicyDecision,
} from './approvalPolicy.js';

import approvalAudit from './approvalAudit.js';
import approvalChain from './approvalChain.js';
import approvalPolicy from './approvalPolicy.js';

/**
 * Approval 模块聚合对象
 */
export const approval = {
  audit: approvalAudit,
  chain: approvalChain,
  policy: approvalPolicy,
};

export default approval;
