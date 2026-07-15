/**
 * 工具系统入口 — 参考 OpenClaw tools 模块
 *
 * 统一导出工具描述符、可用性评估、确定性规划器、安全过滤器、
 * 描述符注册表、描述符适配器和统一执行器。
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

export {
  registerToolDescriptor,
  registerToolDescriptors,
  getToolDescriptor,
  listToolDescriptors,
  listToolDescriptorsByOwner,
  unregisterToolDescriptor,
  unregisterToolDescriptorsByOwner,
  clearToolDescriptors,
  getDescriptorRegistryDiagnostics,
} from './descriptor-registry.js';

export {
  adaptToolDefinition,
  adaptToolDefinitions,
  registerToolDefinitionsAsDescriptors,
  inferOwnerFromName,
  inferExecutorFromName,
  type AdapterConfig,
} from './descriptor-adapter.js';

export {
  executeTool,
  executeToolBatch,
  registerCustomExecutor,
  type ToolExecutionRequest,
  type ToolExecutionResult,
} from './tool-executor.js';
