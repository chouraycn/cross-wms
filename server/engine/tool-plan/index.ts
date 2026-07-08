/**
 * Tool Plan — 公共 barrel
 *
 * 参考 OpenClaw src/tools/index.ts 设计。
 * 这是 runtime owner 的唯一入口，用于：
 * - 定义工具描述符（defineToolDescriptor）
 * - 评估可用性（evaluateToolAvailability）
 * - 构建可见/隐藏规划（buildToolPlan）
 * - 转换描述符为协议载荷（toToolProtocolDescriptor）
 */

// 类型导出
export type {
  JsonPrimitive,
  JsonValue,
  JsonObject,
  ToolOwnerRef,
  ToolExecutorRef,
  ToolAvailabilitySignal,
  ToolAvailabilityExpression,
  ToolDescriptor,
  ToolPlan,
  ToolPlanEntry,
  HiddenToolPlanEntry,
  ToolUnavailableReason,
  ToolPlanContractError,
  ToolProtocolDescriptor,
} from './types.js';

// 规划器导出
export {
  buildToolPlan,
  evaluateToolAvailability,
  formatToolExecutorRef,
  createToolPlanContractError,
  isToolPlanContractError,
  type ToolPlanContext,
} from './planner.js';

// 协议转换导出
export {
  toToolProtocolDescriptor,
  toToolProtocolDescriptors,
  descriptorToProtocolDescriptor,
} from './protocol.js';

// 安全过滤器导出
export {
  SecurityFilter,
  type SecurityRisk,
  type SecurityRiskType,
  type RiskSeverity,
  type OverallRisk,
  type ScanResult,
  type ScanContext,
  type SecurityAuditRecord,
  type SecurityFilterConfig,
  DEFAULT_PII_PATTERNS,
  DEFAULT_ENABLED_CHECKS,
} from './security-filter.js';

// 语义路由器导出
export {
  SemanticRouter,
  type ToolCategory,
  type ToolSemanticMetadata,
  type SemanticRoutingContext,
  type RankedToolPlanEntry,
  type SemanticToolPlan,
} from './semantic-router.js';

// 工具权限管理器导出
export {
  ToolPermissionManager,
  type PermissionLevel,
  type PermissionRule,
  type PermissionConfig,
  type ApprovalRequest,
  type AuditRecord,
  type PermissionResult,
  type AuditQueryOptions,
} from './tool-permissions.js';

import type { ToolDescriptor } from './types.js';

/**
 * 定义单个工具描述符 — 类型安全的工厂函数
 */
export function defineToolDescriptor(
  descriptor: ToolDescriptor
): ToolDescriptor {
  return descriptor;
}

/**
 * 批量定义工具描述符
 */
export function defineToolDescriptors(
  descriptors: ToolDescriptor[]
): ToolDescriptor[] {
  return descriptors;
}
