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

export {
  extractCommandSpecsFromSkill,
  buildCommandIndex,
  findCommandByName,
  listAllCommands,
} from "./discovery/chat-commands.js";

export {
  computeSkillStatus,
  formatStatusReport,
  listSkillsBySource,
  getSkillNames,
} from "./discovery/status.js";

export type { SkillStatusSummary } from "./discovery/status.js";

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
  createSkillProposal,
  updateSkillProposal,
  reviseSkillProposal,
  applySkillProposal,
  rejectSkillProposal,
  readSkillProposal,
  listSkillProposals,
  deleteSkillProposal,
} from "./workshop/service.js";

export {
  SKILL_WORKSHOP_SCHEMA,
  SKILL_WORKSHOP_MANIFEST_SCHEMA,
} from "./workshop/types.js";

export type {
  SkillProposalRecord,
  SkillProposalStatus,
  SkillProposalCreateInput,
  SkillProposalUpdateInput,
  SkillProposalApplyResult,
} from "./workshop/types.js";

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
