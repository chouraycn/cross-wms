/**
 * Flows 流程系统模块 — Barrel 导出
 *
 * 参考 openclaw/src/flows/ 目录，提供 setup/onboarding/doctor 流程的
 * 共享类型、健康检查、模型选择、搜索设置、Provider 配置、渠道设置与诊断流程。
 */

// ===================== 类型与工具函数 =====================

export type {
  FlowDocsLink,
  FlowOptionGroup,
  FlowOption,
  FlowContributionKind,
  FlowContributionSurface,
  FlowContribution,
  HealthFindingSeverity,
  HealthFinding,
  HealthCheckMode,
  HealthCheckContext,
  HealthRepairContext,
  HealthRepairDiff,
  HealthRepairEffect,
  HealthRepairResult,
  HealthCheckScope,
  HealthCheck,
  FlowRuntimeEnv,
  FlowConfig,
} from './types.js';

export {
  HEALTH_FINDING_SEVERITY_RANK,
  parseHealthFindingSeverity,
  healthFindingMeetsSeverity,
  sortFlowContributionsByLabel,
} from './types.js';

// ===================== 健康检查 =====================

export type {
  HealthCheckDefinition,
  HealthCheckResult,
} from './health-checks.js';

export {
  runHealthChecks,
  formatHealthFindings,
  sortHealthFindingsBySeverity,
  sortHealthCheckResultsBySeverity,
} from './health-checks.js';

// ===================== 模型选择 =====================

export type {
  ModelPickerOption,
  ModelPickerContribution,
  BuildModelPickerOptionsParams,
} from './model-picker.js';

export {
  buildModelPickerOptions,
  buildModelPickerContributions,
  formatModelLabel,
  formatTokenK,
  resolveDefaultModel,
  resolveProviderForModelRef,
} from './model-picker.js';

// ===================== 搜索设置 =====================

export type {
  SearchSetupOption,
  SearchSetupContribution,
  BuildSearchSetupOptionsParams,
} from './search-setup.js';

export {
  buildSearchSetupOptions,
  buildSearchSetupContributions,
  isSearchProviderCredentialReady,
  resolveSearchProviderOrder,
  resolveDefaultSearchProvider,
} from './search-setup.js';

// ===================== Provider 配置 =====================

export type {
  ProviderFlowScope,
  ProviderFlowOption,
  ProviderFlowContribution,
  BuildProviderFlowOptionsParams,
  ProviderAuthStatus,
} from './provider-flow.js';

export {
  includesProviderFlowScope,
  inferProviderScopes,
  resolveProviderAuthStatus,
  resolveProviderAuthStatusById,
  buildProviderFlowOptions,
  buildProviderFlowContributions,
} from './provider-flow.js';

// ===================== 渠道设置 =====================

export type {
  ChannelSetupOption,
  ChannelSetupContribution,
  BuildChannelSetupOptionsParams,
} from './channel-setup.js';

export {
  buildChannelSetupOptions,
  buildChannelSetupContributions,
  isChannelEnabled,
  isChannelConfigured,
} from './channel-setup.js';

// ===================== Doctor 诊断 =====================

export type {
  DoctorCheck,
  CreateDoctorChecksParams,
  RunDoctorChecksParams,
} from './doctor-health.js';

export {
  createDoctorChecks,
  runDoctorChecks,
} from './doctor-health.js';
