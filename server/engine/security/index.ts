export { runSecurityAudit, quickAudit } from './audit.js';
export type { AuditResult, AuditFinding, AuditContext, AuditFindingSeverity } from './audit.js';

export { applySecurityFixes, fixFinding } from './fix.js';
export type { FixResult, FixAction } from './fix.js';

export type {
  SecurityLevel,
  SecurityCategory,
  SecurityFinding,
  SecuritySummary,
  SecurityResult,
  SecurityRating,
  PathSecurityCheckResult,
  PluginTrustLevel,
  PluginTrustResult,
  InstallPolicyDecision,
  InstallPolicyResult,
  ContextVisibilityMode,
  ContextVisibilityKind,
  ContextVisibilityDecision,
  ExternalContentSource,
  UrlSecurityCheckResult,
  ConfigSecurityRating,
  ToolSecurityClassification,
  ToolSecurityInfo,
} from './types.js';

export {
  hasNestedRepetition,
  detectRedoSrisks,
  compileSafeRegexDetailed,
  compileSafeRegex,
  testRegexWithBoundedInput,
  auditRegexPattern,
} from './safe-regex.js';
export type { SafeRegexRejectReason, SafeRegexCompileResult } from './safe-regex.js';

export {
  isPathInside,
  normalizePath,
  detectPathTraversal,
  isSensitiveFilePath,
  validatePathWithinBounds,
  scanPathForRisks,
  auditFilePaths,
  sanitizePath,
  safeJoinPath,
} from './scan-paths.js';

export {
  collectDangerousConfigFlags,
  auditConfigSecurity,
  rateConfigSecurity,
  isConfigSafe,
  ConfigSecuritySchema,
} from './dangerous-config-flags.js';
export type { ConfigSecurityOptions } from './dangerous-config-flags.js';

export {
  getToolSecurityInfo,
  classifyTool,
  isToolCritical,
  isToolDangerous,
  requiresToolApproval,
  getDangerousTools,
  getCriticalTools,
  auditToolUsage,
  filterAllowedTools,
  listAllTools,
  listToolsByClassification,
  DEFAULT_GATEWAY_HTTP_TOOL_DENY,
  GATEWAY_OWNER_ONLY_CORE_TOOLS,
} from './dangerous-tools.js';

export {
  safeStat,
  inspectPathPermissions,
  formatPermissionDetail,
  formatPermissionRemediation,
  auditSensitiveFiles,
  logFsAccess,
  getFsAuditLog,
  clearFsAuditLog,
  auditDirectoryPermissions,
  checkPathSecurity,
} from './audit-fs.js';
export type { PermissionCheck, PermissionCheckOptions, FsAuditEntry } from './audit-fs.js';

export {
  collectChannelSecurityFindings,
  auditChannelMessage,
  validateChannelPermissions,
  ChannelSecuritySchema,
} from './audit-channel.js';
export type {
  ChannelType,
  ChannelSecurityConfig,
  ChannelSecurityInfo,
} from './audit-channel.js';

export {
  determinePluginTrustLevel,
  evaluatePluginTrust,
  auditPluginsTrust,
  isPluginTrusted,
  filterTrustedPlugins,
  PluginInfoSchema,
} from './audit-plugins-trust.js';
export type { PluginSource, PluginInfo } from './audit-plugins-trust.js';

export {
  evaluateInstallPolicy,
  isInstallAllowed,
  batchEvaluateInstallPolicy,
  formatInstallDecision,
  InstallPolicyRequestSchema,
} from './install-policy.js';
export type {
  InstallTargetType,
  InstallRequestKind,
  InstallSourceKind,
  InstallAuthority,
  InstallPolicySource,
  InstallPolicyRequest,
} from './install-policy.js';

export {
  evaluateSupplementalContextVisibility,
  shouldIncludeSupplementalContext,
  filterSupplementalContextItems,
  redactSensitiveInfo,
  sanitizeContextForRole,
  buildContextVisibilityReport,
  validateVisibilityMode,
} from './context-visibility.js';

export {
  detectSuspiciousPatterns,
  wrapExternalContent,
  buildSafeExternalPrompt,
  wrapWebContent,
  checkUrlSafety,
  isExternalContent,
} from './external-content.js';
export type { WrapExternalContentOptions, SafeExternalPromptParams } from './external-content.js';

export {
  safeEqualSecret,
  safeEqualSecretBuffer,
  safeCompareHash,
  constantTimeStringCompare,
  verifyApiKey,
  constantTimeFindInArray,
} from './secret-equal.js';
export type { ConstantTimeArrayCompareResult } from './secret-equal.js';

export {
  auditDeepCodeSafety,
  scanCodeForInjectionVectors,
  analyzeCodeImports,
  performFullDeepCodeAudit,
} from './audit-deep-code-safety.js';
export type { DeepCodeSafetyCheck, DeepCodeSafetyFinding } from './audit-deep-code-safety.js';

export {
  runDeepProbe,
  probeFindingsToSecurityFindings,
  getProbeSummary,
  listAvailableProbes,
} from './audit-deep-probe-findings.js';
export type { ProbeFinding, ProbeResult, DeepProbeConfig } from './audit-deep-probe-findings.js';

export { runExtraAsyncAudit, listExtraAsyncChecks } from './audit-extra.async.js';
export type { ExtraAsyncAuditCheck, ExtraAsyncAuditContext } from './audit-extra.async.js';

export { runExtraSyncAudit, listExtraSyncChecks } from './audit-extra.sync.js';
export type { ExtraSyncAuditCheck, ExtraSyncAuditContext } from './audit-extra.sync.js';

export {
  runFullExtraAudit,
  formatExtraAuditSummary,
  getExtraAuditSummaryByCategory,
  getExtraAuditPassStatus,
} from './audit-extra.summary.js';
export type { ExtraAuditSummary } from './audit-extra.summary.js';

export {
  auditModelReferences,
  validateModelConfiguration,
  verifyModelApiKeys,
  getModelSecurityReport,
} from './audit-model-refs.js';
export type { ModelReference, ModelReferenceAuditContext } from './audit-model-refs.js';

export {
  collectCoreDangerousConfigFlags,
  auditCoreConfigSecurity,
  remediateCoreConfigSecurity,
  isCoreConfigSafe,
  CoreConfigSecuritySchema,
} from './dangerous-config-flags-core.js';
export type { CoreConfigFlag } from './dangerous-config-flags-core.js';

export {
  collectCurrentDangerousConfigFlags,
  auditCurrentConfigSecurity,
  getCurrentConfigFlag,
  getCurrentConfigFlagByCategory,
  validateCurrentConfigFlag,
} from './dangerous-config-flags-current.js';
export type { CurrentConfigFlag } from './dangerous-config-flags-current.js';

export {
  parseWindowsAclOutput,
  analyzeWindowsAcl,
  aclToSecurityFindings,
  isWindows,
  getRecommendedWindowsAcl,
} from './windows-acl.js';
export type { WindowsAclEntry, WindowsAclSecurityCheckResult } from './windows-acl.js';

export {
  validateConfigWithRegex,
  validateConfigValue,
  getConfigRegexPattern,
  getConfigRegexPatternsByCategory,
  addCustomConfigRegexPattern,
  removeConfigRegexPattern,
  ConfigRegexSchema,
} from './config-regex.js';
export type { ConfigRegexPattern } from './config-regex.js';

export {
  evaluateDmPolicy,
  auditDmPolicy,
  validateDmPolicy,
  mergeDmPolicies,
} from './dm-policy-shared.js';
export type { DmPolicyType, DmPolicyScope, DmPolicy, DmPolicyDecision } from './dm-policy-shared.js';

export {
  getDefaultExecFilesystemPolicy,
  evaluateExecFilesystemPolicy,
  auditExecFilesystemPolicy,
  validateExecFilesystemPath,
  buildExecFilesystemPolicyFromConfig,
} from './exec-filesystem-policy.js';
export type { ExecFilesystemPolicyRule, ExecFilesystemPolicy, ExecFilesystemAction, ExecFilesystemDecision } from './exec-filesystem-policy.js';

export {
  validateExternalContentSource,
  isExternalContentSourceAllowed,
  normalizeExternalContentSource,
} from './external-content-source.js';
export type { ExternalContentSourceType } from './external-content-source.js';

export {
  scanPluginDirectory,
  auditPluginDirectory,
  findInstalledPlugins,
  auditAllInstalledPlugins,
} from './installed-plugin-dirs.js';
export type { InstalledPluginDir, PluginDirSecurityCheck } from './installed-plugin-dirs.js';

export {
  getSystemTags,
  getSystemTag,
  setSystemTag,
  setSystemTags,
  removeSystemTag,
  clearSystemTags,
  getSystemTagSet,
  findTagsByCategory,
  findTagsByKeyPrefix,
  validateSystemTag,
  auditSystemTags,
  buildSystemTagReport,
} from './system-tags.js';
export type { SystemTag, SystemTagSet, TagSecurityCheckResult } from './system-tags.js';

export {
  getChannelMetadata,
  getAllChannelMetadata,
  setChannelMetadata,
  setAllChannelMetadata,
  removeChannelMetadata,
  clearChannelMetadata,
  getChannelMetadataStore,
  findChannelsByType,
  findChannelsBySecurityLevel,
  validateChannelMetadata,
  auditChannelMetadata,
  buildChannelMetadataReport,
  getChannelSecurityLevel,
} from './channel-metadata.js';
export type { ChannelMetadata, ChannelPermissions, ChannelMetadataStore, ChannelMetadataAuditResult } from './channel-metadata.js';

export {
  getAuditRuntimeConfig,
  setAuditRuntimeConfig,
  getAuditRuntimeStatus,
  registerAuditTask,
  registerAuditTasks,
  unregisterAuditTask,
  clearAuditTasks,
  listAuditTasks,
  filterAuditTasksByCategory,
  runAuditTasks,
  runSingleTask,
  resetAuditRuntime,
} from './audit.runtime.js';
export type { AuditRuntimeState, AuditRuntimeStatus, AuditRuntimeResult, AuditTask, AuditRuntimeConfig } from './audit.runtime.js';

export {
  getDeepAuditConfig,
  setDeepAuditConfig,
  runDeepAudit,
  runDeepAuditOnFiles,
  getDeepAuditPhaseOrder,
} from './audit.deep.runtime.js';
export type { DeepAuditPhase, DeepAuditProgress, DeepAuditResult, DeepAuditConfig } from './audit.deep.runtime.js';

export {
  getNonDeepAuditConfig,
  setNonDeepAuditConfig,
  runNonDeepAudit,
  runQuickNonDeepAudit,
  getNonDeepAuditCategoryOrder,
} from './audit.nondeep.runtime.js';
export type { NonDeepAuditCategory, NonDeepAuditProgress, NonDeepAuditResult, NonDeepAuditConfig } from './audit.nondeep.runtime.js';

export {
  getChannelCollectConfig,
  setChannelCollectConfig,
  runChannelCollectAudit,
  runChannelCollectForSingleChannel,
  getChannelCollectPhaseOrder,
} from './audit-channel.collect.runtime.js';
export type { ChannelCollectPhase, ChannelCollectProgress, ChannelCollectResult, ChannelCollectConfig } from './audit-channel.collect.runtime.js';

export type {
  PolicyConditionOperator,
  PolicyCondition,
  PolicyEffect,
  PolicyAction,
  PolicyPriority,
  PolicyCategory,
  PolicyStatus,
  PolicyRule,
  PolicySet,
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  PolicyStoreOptions,
  PolicyConflictResolution,
  PolicyEngineConfig,
  PolicyValidationResult,
  PolicyChangeEvent,
  PolicyQuery,
  PolicySummary,
} from './policy-types.js';
export { DEFAULT_POLICY_ENGINE_CONFIG, DEFAULT_POLICY_STORE_OPTIONS } from './policy-types.js';

export {
  getPolicyStore,
  addPolicyRule,
  addPolicyRules,
  getPolicyRule,
  getAllPolicyRules,
  updatePolicyRule,
  deletePolicyRule,
  enablePolicyRule,
  disablePolicyRule,
  getActivePolicyRules,
  queryPolicyRules,
  getPolicySummary,
  validatePolicyRule,
} from './policy-store.js';

export {
  evaluatePolicy,
  evaluatePolicyWithDebug,
  checkPolicyMatch,
} from './policy-evaluator.js';

export {
  getPolicyEngine,
  initializePolicyEngine,
  evaluatePolicyRule,
  addSecurityPolicy,
  removeSecurityPolicy,
  getSecurityPolicy,
  getAllSecurityPolicies,
  getActiveSecurityPolicies,
  enableSecurityPolicy,
  disableSecurityPolicy,
  getPolicyEngineSummary,
} from './policy-engine.js';