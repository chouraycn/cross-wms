/**
 * 工具系统入口 — 参考 OpenClaw tools 模块
 *
 * 统一导出工具描述符、可用性评估、确定性规划器和安全过滤器。
 */

export type {
  JsonPrimitive,
  JsonValue,
  JsonObject,
  ToolOwnerRef,
  ToolExecutorRef,
  ToolAvailabilitySignal,
  ToolAvailabilityExpression,
  ToolDescriptor,
  ToolAvailabilityContext,
  ToolUnavailableReason,
  ToolAvailabilityDiagnostic,
  ToolPlanEntry,
  HiddenToolPlanEntry,
  ToolPlan,
  BuildToolPlanOptions,
} from './types.js';

export {
  evaluateToolAvailability,
} from './availability.js';

export {
  buildToolPlan,
  ToolPlanContractError,
} from './planner.js';

export {
  scanContent,
  isContentSafe,
  type SecurityRiskType,
  type RiskSeverity,
  type OverallRisk,
  type SecurityRisk,
  type ScanResult,
  type ScanContext,
  type PIIPattern,
} from './security-filter.js';
