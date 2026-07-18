/**
 * Flows 流程系统模块 — Barrel 导出
 *
 * 提供 setup/onboarding/doctor 流程的共享类型、健康检查、模型选择、
 * 搜索设置、Provider 配置、渠道设置与诊断流程。
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
  FlowContext,
  FlowStepStatus,
  FlowStep,
  FlowStepResult,
  FlowResult,
  HealthCheckRunContext,
  HealthCheckRunResult,
  RunnableHealthCheck,
  HealthCheckInput,
  RegisteredHealthCheck,
  DoctorCheckCategory,
  DoctorCheckMeta,
  DoctorLintRunOptions,
  DoctorLintRunResult,
  DoctorRepairRunOptions,
  DoctorRepairRunResult,
} from './types.js';

export {
  HEALTH_FINDING_SEVERITY_RANK,
  parseHealthFindingSeverity,
  healthFindingMeetsSeverity,
  sortFlowContributionsByLabel,
} from './types.js';

// ===================== 健康检查注册表 =====================

export {
  HealthCheckRegistrationError,
  registerHealthCheck,
  listHealthChecks,
  listExtensionHealthChecksForDoctor,
  getHealthCheck,
  hasHealthCheck,
  healthCheckCount,
  clearHealthChecksForTest,
  registerHealthChecks,
  getHealthChecksByIds,
} from './health-check-registry.js';

// ===================== 健康检查适配器 =====================

export {
  defineSplitHealthCheck,
  normalizeHealthCheck,
  normalizeHealthChecks,
} from './health-check-adapter.js';

// ===================== 健康检查运行器 =====================

export type {
  HealthCheckRunnerResult,
  HealthCheckRunnerSummary,
} from './health-check-runner.js';

export {
  createValidationScope,
  hasHealthRepairOutput,
  sortFindingsBySeverity,
  runSingleCheck,
  runChecks,
  runSingleCheckWithRepair,
  filterChecksByIds,
} from './health-check-runner.js';

// ===================== 健康检查核心逻辑 =====================

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

// ===================== Doctor 核心检查 =====================

export {
  CONFIG_INTEGRITY_CHECK_ID,
  PROVIDER_AUTH_CHECK_ID,
  CHANNEL_CONFIG_CHECK_ID,
  SEARCH_PROVIDER_CHECK_ID,
  DEFAULT_MODEL_CHECK_ID,
  WORKING_DIR_CHECK_ID,
  ENVIRONMENT_CHECK_ID,
  configIntegrityCheck,
  workingDirectoryCheck,
  environmentCheck,
  buildCoreHealthChecks,
  registerCoreHealthChecks,
  resetCoreHealthChecksForTest,
  createProviderAuthCheck,
  createChannelConfigCheck,
  createSearchProviderCheck,
  createDefaultModelCheck,
} from './doctor-core-checks.js';

export type {
  ProviderAuthCheckDeps,
  ChannelConfigCheckDeps,
  SearchProviderCheckDeps,
  DefaultModelCheckDeps,
  CoreHealthCheckDeps,
} from './doctor-core-checks.js';

// ===================== Doctor Lint 流程 =====================

export {
  runDoctorLintChecks,
  exitCodeFromFindings,
  countFindingsBySeverity,
  formatLintResult,
} from './doctor-lint-flow.js';

// ===================== Doctor 修复流程 =====================

export {
  runDoctorHealthRepairs,
  formatRepairResult,
} from './doctor-repair-flow.js';

// ===================== 模型选择 =====================

export type {
  ModelPickerOption,
  ModelPickerContribution,
  BuildModelPickerOptionsParams,
  ModelGroupBy,
} from './model-picker.js';

export {
  buildModelPickerOptions,
  buildModelPickerContributions,
  formatModelLabel,
  formatTokenK,
  resolveDefaultModel,
  resolveProviderForModelRef,
  groupModelsByProvider,
  groupModelsByAuthStatus,
  filterReasoningModels,
  filterModelsByMinContext,
  parseModelRef,
  isValidModelRef,
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
  ChannelSetupStatusSummary,
} from './channel-setup.js';

export {
  buildChannelSetupOptions,
  buildChannelSetupContributions,
  isChannelEnabled,
  isChannelConfigured,
  summarizeChannelSetupStatus,
  groupChannelOptionsByCategory,
  isChannelConfiguredById,
} from './channel-setup.js';

// ===================== Doctor 诊断（旧版，向后兼容） =====================

export type {
  DoctorCheck,
  CreateDoctorChecksParams,
  RunDoctorChecksParams,
} from './doctor-health.js';

export {
  createDoctorChecks,
  runDoctorChecks,
} from './doctor-health.js';
