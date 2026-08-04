// 末尾便捷封装函数所需的依赖（barrel 重新导出不会创建本地绑定，故单独导入）。
import { searchSkillsFromClawHub } from "./lifecycle/clawhub.js";
import { fetchClawHubSkillDetail as fetchClawHubSkillDetailFromRegistry } from "../infra/clawhub.js";
import { scanDirectoryWithSummary } from "./security/scanner.js";
import { getCachedSkills } from "./runtime/refresh.js";

export * from "./types.js";

export {
  formatSkillsForPrompt,
  resolveSkillKey,
  resolveSkillSource,
} from "./loading/skill-contract.js";

export {
  parseFrontmatter,
  resolveSkillInvocationPolicy,
  resolveSkillMetadata,
  parseInstallSpec,
} from "./loading/frontmatter.js";

export {
  loadSkillFromDirectory,
  loadSkillsFromDirectory,
  skillDirectoryExists,
} from "./loading/local-loader.js";

export {
  getWorkspaceSkillsDir,
  loadWorkspaceSkills,
  loadWorkspaceSkill,
  workspaceSkillExists,
  listWorkspaceSkillNames,
  ensureWorkspaceSkillsDir,
} from "./loading/workspace.js";

export {
  normalizeSkillFilter,
  normalizeSkillFilterForComparison,
  matchesSkillFilter,
  skillMatchesFilter,
  normalizeSkillName,
} from "./discovery/filter.js";

export {
  buildSkillIndexEntries,
  isSkillRuntimeVisible,
  isSkillPromptVisible,
  isSkillUserInvocable,
  filterPromptVisibleSkillEntries,
  filterUserInvocableSkillEntries,
  findSkillByNormalizedName,
  searchSkills,
} from "./discovery/skill-index.js";

export type { SkillIndexEntry } from "./discovery/skill-index.js";

export type { SkillStatusSummary } from "./discovery/status.js";

export {
  setAgentFilterConfig,
  getAgentFilterConfig,
  setAgentFilter,
  getAgentFilter,
  removeAgentFilter,
  clearAllAgentFilters,
  isSkillVisibleForAgent,
  filterSkillsForAgent,
  listAgentVisibleSkills,
  addSkillToAgentWhitelist,
  removeSkillFromAgentWhitelist,
  denySkillForAgent,
  allowSkillForAgent,
  saveAgentFiltersToFile,
  loadAgentFiltersFromFile,
  getAgentFilterCount,
} from "./discovery/agent-filter.js";

export type {
  AgentSkillVisibility,
  AgentSkillFilter,
  FilteredSkillEntry,
  AgentFilterConfig,
} from "./discovery/agent-filter.js";

export {
  registerCommandSpec,
  unregisterCommandSpec,
  getCommandSpec,
  getSkillCommands,
  getAllCommandSpecs,
  listCommandCategories,
  addCommandCategory,
  searchCommands,
  validateCommandParams,
  formatCommandHelp,
  clearCommandRegistry,
} from "./discovery/command-specs.js";

export type {
  CommandParameter,
  CommandOutputSpec,
  SkillCommandSpec,
  SkillCommandDispatchSpec,
  CommandCategory,
  SearchCommandsOptions,
  ValidationResult,
} from "./discovery/command-specs.js";

export {
  registerCommandHandler,
  unregisterCommandHandler,
  hasCommandHandler,
  listAvailableCommands,
  dispatchCommand,
  clearCommandHandlers,
} from "./discovery/command-dispatch.js";

export type { DispatchRequest, DispatchResponse, CommandHandler } from "./discovery/command-dispatch.js";

export {
  installSkill,
  uninstallSkill,
  validateInstallSpec,
} from "./lifecycle/install.js";

export type { InstallResult, InstallOptions } from "./lifecycle/install.js";

export {
  installFromDirectory,
  archiveSkill,
} from "./lifecycle/archive-install.js";

export type { ArchiveInstallResult, ArchiveInstallOptions } from "./lifecycle/archive-install.js";

export {
  installFromSource,
  updateSkillContent,
  createSkillFromTemplate,
  validateSkillName,
} from "./lifecycle/source-install.js";

export type { SourceInstallResult, SourceInstallOptions } from "./lifecycle/source-install.js";

export {
  installSkillFromClawHub,
  updateSkillsFromClawHub,
  readTrackedClawHubSkillSlugs,
} from "./lifecycle/clawhub.js";

export {
  downloadFile,
  downloadWithRetry,
  verifyChecksum,
  computeFileChecksum,
  downloadClawHubSkillArchive,
  getTempDir,
  cleanupTempDir,
} from "./lifecycle/install-download.js";

export {
  extractArchive,
  findArchiveRootDir,
  withExtractedArchiveRoot,
  isValidSkillArchive,
  CLAWHUB_SKILL_ARCHIVE_ROOT_MARKERS,
} from "./lifecycle/install-extract.js";



export type {
  InstallSource,
  SkillInstallSpec,
  DownloadOptions,
  ExtractOptions,
  ClawHubSkillArchive,
  WorkspaceSkillSupportFile,
} from "./lifecycle/install-types.js";

export {
  parseDependencyConfig,
  buildDependencyGraph,
  detectCycles,
  checkDependencies,
  checkAllDependencies,
  sortByDependencies,
  formatDependencyResult,
  generateDependencyReport,
} from "./lifecycle/dependency.js";

export type {
  SkillDependency,
  SkillConflict,
  SkillDependencyNode,
  DependencyCheckResult,
  SkillDependencyConfig,
} from "./types.js";

export {
  registerToolHandler,
  unregisterToolHandler,
  getToolHandler,
  hasToolHandler,
  listRegisteredTools,
  dispatchSkillCommand,
  createSkillToolRegistry,
  clearToolHandlers,
} from "./runtime/tool-dispatch.js";

export type {
  ToolDispatchContext,
  ToolDispatchResult,
  ToolHandler,
  SkillToolRegistry,
} from "./runtime/tool-dispatch.js";

export {
  buildSessionSkillSnapshot,
  snapshotToLegacyFormat,
  snapshotsEqual,
  diffSnapshots,
  getSkillFromSnapshot,
  getSkillNamesFromSnapshot,
} from "./runtime/session-snapshot.js";

export type { SessionSkillSnapshot, BuildSnapshotOptions } from "./runtime/session-snapshot.js";

export {
  refreshSkills,
  getCachedSkills,
  getLastRefreshTime,
  clearSkillCache,
  needsRefresh,
  getSkills,
  setRefreshInterval,
} from "./runtime/refresh.js";

export type { RefreshResult } from "./runtime/refresh.js";

// env-overrides.ts 的 WMS 规划函数（registerSkillEnvOverride 等）未实现，移除值重导出。
// 保留类型重导出（运行时被擦除，不影响启动）。
export type { SkillEnvOverride, SkillEnvOverrideOptions, ProcessEnvSnapshot } from "./runtime/env-overrides.js";

export {
  startSkillSnapshotCron,
  stopSkillSnapshotCron,
  triggerManualRefresh,
  getSnapshotStats,
  getLastSnapshot,
  getLastStatus,
  isRefreshing,
  resetCronSnapshotState,
  DEFAULT_SNAPSHOT_INTERVAL_MS,
  MIN_SNAPSHOT_INTERVAL_MS,
} from "./runtime/cron-snapshot.js";

export type {
  SkillSnapshotConfig,
  SnapshotStats,
  ScheduledRefreshHandle,
} from "./runtime/cron-snapshot.js";

export type {
  RemoteSkillNodeStatus,
  RemoteSkillSyncStatus,
  RemoteSkillNode,
  RemoteSkill,
  RemoteSyncConfig,
  SyncResult,
} from "./runtime/remote.js";

export {
  scanSource,
  scanSkillContent,
  scanDirectoryWithSummary,
  getSeverityCount,
  hasCriticalFindings,
  filterFindingsBySeverity,
} from "./security/scanner.js";

export type {
  SkillScanSeverity,
  SkillScanFinding,
  SkillScanSummary,
  SkillScanOptions,
} from "./security/scanner.js";

export {
  auditWorkspaceSkills,
  auditSingleSkill,
  getSkillsWithCriticalIssues,
  getSkillIssueCount,
  formatAuditReport,
} from "./security/workspace-audit.js";

export type { WorkspaceAuditResult, AuditOptions } from "./security/workspace-audit.js";

export {
  reviseSkillProposal,
  applySkillProposal,
  rejectSkillProposal,
  listSkillProposals,
} from "./workshop/service.js";

export {
  SKILL_WORKSHOP_SCHEMA,
  SKILL_WORKSHOP_MANIFEST_SCHEMA,
} from "./workshop/types.js";

export type {
  SkillProposalStatus,
  SkillProposalCreateInput,
  SkillProposalUpdateInput,
  SkillProposalApplyResult,
} from "./workshop/types.js";

export {
  recordSkillUsage,
  analyzeUsageSignals,
  getTopUsedSkills,
  getUnderusedSkills,
  detectUsagePatterns,
  generateSkillSuggestions,
  clearUsageSignals,
  getUsageStats,
} from "./research/signals.js";

export type {
  SkillUsageSignal,
  UsagePattern,
  SkillSuggestion,
  SignalAnalysisResult,
  UsageStats,
} from "./research/signals.js";

export {
  recordMetric,
  recordExecution,
  getSkillStats,
  getAllSkillStats,
  resetSkillStats,
  getTopSkillsByMetric,
  exportMetrics,
  startMetricsExporter,
  stopMetricsExporter,
  exportToPrometheus,
  exportToJSON,
  exportToFile,
} from "./metrics/index.js";

export type {
  SkillMetric,
  SkillPerformanceStats,
  MetricType,
  MetricsExporterOptions,
} from "./metrics/index.js";

export {
  captureConversation,
  summarizeCapturedConversations,
  detectPotentialSkillNeeds,
  getCapturedConversations,
  clearCapturedConversations,
} from "./research/autocapture.js";

export type {
  CapturedMessage,
  CapturedConversation,
  PotentialSkillNeed,
} from "./research/autocapture.js";

export {
  tokenize,
  extractKeywords,
  detectIntent,
  extractToolMentions,
  computeTextSimilarity,
} from "./research/text.js";

export {
  recordMutation,
  getMutationHistory,
  getRecentMutations,
  getCurrentConfig,
  applyConfigChange,
  rollbackToMutation,
  rollbackLastMutation,
  compareConfigs,
  clearMutationHistory,
  saveMutationHistory,
  loadMutationHistory,
} from "./config/mutations.js";

export type {
  SkillConfigMutation,
  MutationHistory,
  MutationApplyOptions,
  RollbackResult,
} from "./config/mutations.js";

export {
  deepDiff,
  applyPatch,
  reversePatch,
} from "./config/diff.js";

export type { DiffEntry } from "./config/diff.js";

// ============================================================================
// 数据访问层（engine 层调用 dao 层）
// 封装 dao/skills.js 与 dao/chains.js 的技能数据访问，供路由层统一通过
// engine/skills/ 调用。engine/skills/ 本身聚焦技能加载/发现/生命周期逻辑，
// 数据持久化由 dao 层提供。
// ============================================================================
export {
  getUserSkills,
  getUserSkillById,
  createUserSkill,
  updateUserSkill,
  deleteUserSkill,
  getBuiltinPatches,
  setBuiltinPatch,
  removeBuiltinPatch,
} from "../../dao/skills.js";
export {
  getLatestSkillAudit,
  getSkillAuditHistory,
  createSkillAudit,
} from "../../dao/chains.js";

export {
  startHotReload,
  stopHotReload,
  reloadSkill,
  reloadAllSkills,
  getHotReloadStatus,
  onSkillChange,
  getDefaultConfig,
} from "./runtime/hot-reload.js";

export type {
  SkillChange,
  SkillChangeType,
  HotReloadConfig,
  HotReloadResult,
  HotReloadStatus,
  SkillChangeListener,
} from "./runtime/hot-reload.js";

// ============================================================================
// P1: Agent 白名单、门控、优先级系统
// ============================================================================

export {
  AgentAllowlistManager,
  getAgentAllowlistManager,
  initAgentAllowlistManager,
  resetAgentAllowlistManager,
} from "./discovery/agent-allowlist.js";

export type {
  AgentConfig,
  AgentsConfig,
  AllowlistFilterResult,
} from "./discovery/agent-allowlist.js";

export {
  SkillGatingManager,
  getSkillGatingManager,
  initSkillGatingManager,
  resetSkillGatingManager,
  quickGatingCheck,
  isBinAvailable,
  isEnvAvailable,
} from "./discovery/skill-gating.js";

export type {
  SkillRequires,
  GatingCheckResult,
  ConfigChecker,
} from "./discovery/skill-gating.js";

export {
  SkillPriorityResolver,
  getSkillPriorityResolver,
  initSkillPriorityResolver,
  resetSkillPriorityResolver,
  getPriorityName,
  comparePriority,
  isHigherPriority,
} from "./discovery/skill-priority.js";

export {
  SkillPriority,
} from "./discovery/skill-priority.js";

export type {
  SkillSourceInfo,
  SkillResolutionResult,
  SkillRootConfig,
} from "./discovery/skill-priority.js";

// ============================================================================
// P2: 安装策略、来源追踪、签名验证
// ============================================================================

export {
  InstallPolicyManager,
  getInstallPolicyManager,
  initInstallPolicyManager,
  resetInstallPolicyManager,
  checkInstallAllowed,
} from "./security/install-policy.js";

export type {
  InstallPolicy,
  PolicyCheckInput,
  PolicyCheckResult,
  SecurityConfig,
} from "./security/install-policy.js";

export {
  SkillOriginTracker,
  getSkillOriginTracker,
  initSkillOriginTracker,
  resetSkillOriginTracker,
  calculateSha256,
  createSkillOrigin,
} from "./lifecycle/skill-origin.js";

export type {
  SkillSourceType,
  SkillOrigin,
  InstallationRecord,
} from "./lifecycle/skill-origin.js";

export {
  SignatureVerifier,
  SourceVerifier,
  getSignatureVerifier,
  initSignatureVerifier,
  getSourceVerifier,
  initSourceVerifier,
  resetVerifiers,
} from "./security/signature-verifier.js";

export type {
  SignatureAlgorithm,
  SignatureVerificationResult,
  SignatureInfo,
  PublicKeyInfo,
  SourceVerificationResult,
} from "./security/signature-verifier.js";

// ============================================================================
// P3: 插件技能、远程节点探测
// ============================================================================

export {
  PluginSkillsManager,
  getPluginSkillsManager,
  initPluginSkillsManager,
  resetPluginSkillsManager,
} from "./lifecycle/plugin-skills.js";

export type {
  PluginSkillConfig,
  PluginManifest,
  PluginInfo,
  PluginSkillsSyncResult,
  PluginManagerConfig,
} from "./lifecycle/plugin-skills.js";

export {
  RemoteNodeProber,
  getRemoteNodeProber,
  initRemoteNodeProber,
  resetRemoteNodeProber,
  getCurrentPlatform,
  isMacOS,
  isLinux,
  isWindows,
} from "./runtime/remote-prober.js";

export type {
  RemoteNodeConfig,
  BinProbeResult,
  NodeStatus,
} from "./runtime/remote-prober.js";

// ============================================================================
// 深度完善：沙箱隔离、加载诊断、技能验证器
// ============================================================================

export {
  sanitizeEnvVars,
  validateEnvVarValue,
  isInsideSandbox,
  assertInsideSandbox,
  resolveSandboxPath,
  syncSkillToSandbox,
  cleanSandbox,
  getSandboxSkillsDir,
  SkillEnvTracker,
  getSkillEnvTracker,
  resetSkillEnvTracker,
} from "./security/sandbox.js";

export type {
  SanitizedEnvResult,
  SyncConfig,
  SyncResult as SandboxSyncResult,
} from "./security/sandbox.js";

export {
  validateSkillDescription,
  validateSkillSummary,
  validateSkillVersion,
  validateSkillSlug,
  DiagnosticCollector,
  createLoadResult,
  loadSkillSafely,
} from "./loading/skill-diagnostics.js";

export type {
  DiagnosticLevel,
  ResourceDiagnostic,
  LoadSkillsResult,
} from "./loading/skill-diagnostics.js";

// ============================================================================
// 高级功能：会话快照、工作流、聊天命令、信号追踪
// ============================================================================

export {
  SessionSnapshotManager,
  getSessionSnapshotManager,
  initSessionSnapshotManager,
  resetSessionSnapshotManager,
} from "./runtime/session-snapshot.js";

export type {
  SkillUsageRecord,
  SnapshotMetadata,
  SessionSnapshot,
  RestoreOptions,
  RestoreResult,
} from "./runtime/session-snapshot.js";

export {
  SkillWorkshopService,
  getSkillWorkshopService,
  initSkillWorkshopService,
  resetSkillWorkshopService,
} from "./workshop/workshop-service.js";

export type {
  ProposalStatus,
  ProposalAction,
  ProposalChangeType,
  ProposalChange,
  ProposalReview,
  SkillProposal,
  CreateProposalOptions,
  ProposalActionResult,
} from "./workshop/workshop-service.js";

export type {
  ChatCommandType,
  ChatCommandAction,
  ChatCommand,
  CommandResult,
  CommandHandler as ChatCommandHandler,
} from "./discovery/chat-commands.js";

export {
  SkillSignalTracker,
  SkillPerformanceMonitor,
  getSkillSignalTracker,
  getSkillPerformanceMonitor,
  resetSkillResearch,
} from "./research/autocapture.js";

export type {
  SignalType,
  SkillSignal,
  SignalStats,
  SkillUsagePattern,
  PerformanceSuggestion,
} from "./research/autocapture.js";

// ============================================================================
// 加载层：bundled-context, runtime-config, source, serialize
// ============================================================================

export {
  resolveBundledSkillsContext,
} from "./loading/bundled-context.js";

export type {
  BundledSkillsResolveOptions,
  BundledSkillsContext,
} from "./loading/bundled-context.js";

export {
  resolveSkillRuntimeConfig,
} from "./loading/runtime-config.js";

export {
  resolveSkillTelemetrySourceValue,
  resolveSkillTelemetrySource,
} from "./loading/source.js";

export type {
  SkillTelemetrySource,
} from "./loading/source.js";

export {
  serializeByKey,
} from "./loading/serialize.js";

// ============================================================================
// 发现层：bins, status
// ============================================================================

export {
  collectSkillBins,
} from "./discovery/bins.js";

export {
  resolveSkillStatusEntry,
} from "./discovery/status.js";

export type {
  SkillStatusConfigCheck,
  SkillInstallOption,
  SkillStatusEntry,
  SkillStatusReport,
} from "./discovery/status.js";

// ============================================================================
// 运行时：snapshot-hydration, tools-dir
// ============================================================================

export {
  hydrateResolvedSkills,
} from "./runtime/snapshot-hydration.js";

export type {
  SnapshotWithRuntimeSkills,
  SnapshotRebuild,
} from "./runtime/snapshot-hydration.js";

export {
  resolveSkillToolsRootDir,
} from "./runtime/tools-dir.js";

// ============================================================================
// 安全：workspace-audit
// ============================================================================

export {
  collectWorkspaceSkillSymlinkEscapeFindings,
} from "./security/workspace-audit.js";

export type {
  SecurityAuditFinding,
} from "./security/workspace-audit.js";

// ============================================================================
// 加载层：config
// ============================================================================

export {
  resolveSkillsInstallPreferences,
  isConfigPathTruthy,
  resolveSkillConfig,
  resolveBundledAllowlist,
  isBundledSkillAllowed,
  shouldIncludeSkill,
} from "./loading/config.js";

// ============================================================================
// 运行时：embedded-run-entries, refresh
// ============================================================================

export {
  resolveEmbeddedRunSkillEntries,
} from "./runtime/embedded-run-entries.js";

export type {
  SkillSnapshot,
} from "./runtime/embedded-run-entries.js";

export {
  ensureSkillsWatcher,
  shouldIgnoreSkillsWatchPath,
  resetSkillsRefreshForTest,
  bumpSkillsSnapshotVersion,
  getSkillsSnapshotVersion,
  registerSkillsChangeListener,
  shouldRefreshSnapshotForVersion,
} from "./runtime/refresh.js";

export type {
  SkillsChangeEvent,
} from "./runtime/refresh.js";

// ============================================================================
// Workshop：config
// ============================================================================

export {
  resolveSkillWorkshopConfig,
} from "./workshop/config.js";

export type {
  SkillWorkshopConfig,
} from "./workshop/config.js";

// ============================================================================
// Workshop：policy
// ============================================================================

export {
  resolveSkillWorkshopToolApproval,
} from "./workshop/policy.js";

export type {
  PluginHookBeforeToolCallResult,
} from "./workshop/policy.js";

// ============================================================================
// 发现层：chat-command-invocation
// ============================================================================

export {
  listReservedChatSlashCommandNames,
  resolveSkillCommandInvocation,
} from "./discovery/chat-command-invocation.js";

// ============================================================================
// 测试支持：test-support
// 这些文件已改为惰性加载 vitest，生产环境可安全导入。
// ============================================================================

export {
  writeSkill as writeTestSkill,
  writeWorkspaceSkills,
} from "./test-support/e2e-test-helpers.js";

export {
  writeSkill as writeUnitTestSkill,
  createCanonicalFixtureSkill,
  createFixtureSkillEntry,
} from "./test-support/test-helpers.js";

export {
  runCommandWithTimeoutMock,
  fetchWithSsrFGuardMock,
  hasBinaryMock,
  setupTestMocks,
} from "./test-support/install-test-mocks.js";

export {
  writePluginWithSkill,
} from "./test-support/skill-plugin-fixtures.test-support.js";

export {
  setMockSkillsHomeEnv,
  restoreMockSkillsHomeEnv,
} from "./test-support/home-env.test-support.js";

export type {
  SkillsHomeEnvSnapshot,
} from "./test-support/home-env.test-support.js";

export {
  createInstallDownloadTestState,
} from "./test-support/install-download-test-utils.js";

export type {
  OpenClawTestState,
} from "./test-support/install-download-test-utils.js";

// ============================================================================
// lifecycle：workspace-skill-write
// ============================================================================

export {
  normalizeWorkspaceSkillSupportPath,
  assertWorkspaceSkillSupportPathSetIsFileOnly,
  readWorkspaceSkillFile,
  readWorkspaceSupportFile,
  writeWorkspaceSkill,
  assertInsideWorkspace,
  MAX_WORKSPACE_SKILL_SUPPORT_FILE_BYTES,
} from "./lifecycle/workspace-skill-write.js";

// ============================================================================
// loading：session, skill-version
// ============================================================================

export {
  loadSkillsFromDir,
  loadSkills,
} from "./loading/session.js";

export type {
  ParsedSkillFrontmatter as SkillFrontmatter,
  Skill as SkillType,
} from "./types.js";
export type {
  LoadSkillsResult as SessionLoadSkillsResult,
  LoadSkillsFromDirOptions,
  LoadSkillsOptions,
} from "./loading/session.js";

export {
  computeSkillPromptVersion,
} from "./loading/skill-version.js";

// ============================================================================
// config：mutations
// ============================================================================

export {
  patchSkillConfigEntry,
  updateSkillConfigEntry,
} from "./config/mutations.js";

// ============================================================================
// 技能市场搜索 / 安全判定 / 提案管理（engine 层便捷封装）
// 以下函数在 barrel 重新导出之外提供高层 API：ClawHub 搜索回退到本地缓存、
// 安全判定复用 security/scanner.ts 的扫描器、提案管理使用内存存储。
// ============================================================================

// 内存提案存储：workshop/service.ts 的完整提案工作流签名较重且依赖
// workspaceDir，此处保留轻量级 create/read/delete 语义，签名与占位实现一致。
const skillProposalStore = new Map<string, SkillProposalRecord>();

/** 将扫描器严重级别（info/warn/critical）映射为判定严重级别。 */
function mapScanSeverity(
  severity: "info" | "warn" | "critical",
): "low" | "medium" | "high" | "critical" {
  if (severity === "critical") return "critical";
  if (severity === "warn") return "high";
  return "low";
}

/** 根据扫描摘要计算本地安全判定（score 与 safe 字段）。 */
function summarizeScanToVerdict(params: {
  critical: number;
  warn: number;
  info: number;
  findings: Array<{ severity: "info" | "warn" | "critical"; message: string }>;
}): SkillSecurityVerdict {
  const findings = params.findings.map((finding) => ({
    severity: mapScanSeverity(finding.severity),
    message: finding.message,
  }));
  const score = Math.max(
    0,
    100 - params.critical * 40 - params.warn * 15 - params.info * 5,
  );
  return {
    safe: params.critical === 0,
    score,
    findings,
  };
}

/** 从本地已加载技能缓存中解析 skillKey 对应的技能目录。 */
function resolveSkillDirFromCache(skillKey: string): string | undefined {
  const skills = getCachedSkills();
  const entry = skills.find(
    (item) => item.skill.name === skillKey || item.skill.filePath === skillKey,
  );
  return entry?.skill.baseDir;
}

export async function searchClawHubSkills(params: {
  query: string;
  limit?: number;
}): Promise<Array<{ slug: string; name: string; description: string }>> {
  // 优先调用 ClawHub 注册表搜索（lifecycle/clawhub.ts 封装的 searchSkillsFromClawHub）。
  try {
    const results = await searchSkillsFromClawHub({
      query: params.query,
      limit: params.limit,
    });
    return results.map((result) => ({
      slug: result.slug,
      name: result.displayName,
      description: result.summary ?? "",
    }));
  } catch {
    // 注册表不可用时，回退到本地已加载技能的关键词搜索。
    const query = params.query.trim().toLowerCase();
    if (!query) return [];
    const limit = params.limit ?? 20;
    const matches: Array<{ slug: string; name: string; description: string }> = [];
    for (const entry of getCachedSkills()) {
      const name = entry.skill.name?.toLowerCase() ?? "";
      const description = entry.skill.description?.toLowerCase() ?? "";
      if (name.includes(query) || description.includes(query)) {
        matches.push({
          slug: entry.skill.name,
          name: entry.skill.name,
          description: entry.skill.description ?? "",
        });
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }
}

export async function fetchClawHubSkillDetail(slug: string): Promise<{
  slug: string;
  name: string;
  description: string;
  version?: string;
} | null> {
  try {
    const detail = await fetchClawHubSkillDetailFromRegistry({ slug });
    if (!detail.skill) return null;
    return {
      slug: detail.skill.slug,
      name: detail.skill.displayName,
      description: detail.skill.summary ?? "",
      ...(detail.latestVersion?.version
        ? { version: detail.latestVersion.version }
        : {}),
    };
  } catch {
    return null;
  }
}

export type SkillSecurityVerdict = {
  safe: boolean;
  score: number;
  findings: Array<{ severity: "low" | "medium" | "high" | "critical"; message: string }>;
};

export async function getSkillSecurityVerdict(
  skillKey: string,
): Promise<SkillSecurityVerdict | null> {
  const skillDir = resolveSkillDirFromCache(skillKey);
  if (!skillDir) return null;
  return await computeLocalVerdict({ skillKey, skillDir });
}

export function getVerdictSummary(verdict: SkillSecurityVerdict | null): string {
  if (!verdict) return "No verdict available";
  return verdict.safe ? "Safe" : `Unsafe (score: ${verdict.score})`;
}

export async function computeLocalVerdict(params: {
  skillKey: string;
  skillDir?: string;
}): Promise<SkillSecurityVerdict> {
  const skillDir = params.skillDir ?? resolveSkillDirFromCache(params.skillKey);
  if (!skillDir) {
    return { safe: true, score: 100, findings: [] };
  }
  try {
    const summary = await scanDirectoryWithSummary(skillDir, {
      excludeTestFiles: true,
    });
    return summarizeScanToVerdict({
      critical: summary.critical,
      warn: summary.warn,
      info: summary.info,
      findings: summary.findings,
    });
  } catch {
    return { safe: true, score: 100, findings: [] };
  }
}

export type SkillProposalRecord = {
  id: string;
  title: string;
  description: string;
  status: "pending" | "approved" | "rejected";
  createdAt: number;
};

export async function createSkillProposal(proposal: {
  title: string;
  description: string;
  content?: string;
}): Promise<SkillProposalRecord> {
  const record: SkillProposalRecord = {
    id: `proposal_${Date.now()}`,
    title: proposal.title,
    description: proposal.description,
    status: "pending",
    createdAt: Date.now(),
  };
  skillProposalStore.set(record.id, record);
  return record;
}

export async function readSkillProposal(
  id: string,
): Promise<SkillProposalRecord | null> {
  return skillProposalStore.get(id) ?? null;
}

export async function deleteSkillProposal(id: string): Promise<boolean> {
  return skillProposalStore.delete(id);
}
