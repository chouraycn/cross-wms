// 移植自 openclaw/src/infra/exec-approvals.ts（降级实现）
// 管理 exec 审批策略、allowlist 条目和 host 目标。
//
// 降级策略：
// 1. 源文件依赖 @openclaw/normalization-core/string-coerce，cross-wms 中位于 ./string-coerce.js
// 2. 源文件依赖 ../routing/session-key.js 的 DEFAULT_AGENT_ID，从 ./_openclaw-infra-deps.js 导入
// 3. 源文件依赖 ./command-analysis/explain.js 的 CommandExplanationSummary 类型，
//    从 ./_openclaw-infra-deps.js 导入（降级类型）
// 4. 源文件依赖 ./exec-approvals-allowlist.js（未完整移植），这里提供降级的类型与函数
// 5. 源文件依赖 ./fs-safe-advanced.js 的 assertNoSymlinkParentsSync，
//    从 ./_openclaw-infra-deps.js 导入（降级为 no-op）
// 6. 源文件依赖 ./home-dir.js（已移植并扩展）
// 7. 源文件依赖 ./jsonl-socket.js（已移植）
// 8. 源文件依赖 ./shell-inline-command.js（已移植）
// 9. 源文件依赖 ./exec-wrapper-resolution.js（已移植）
// 10. 复杂的文件 I/O 与审批持久化函数降级为抛出错误或返回默认值
//
// 重要：此文件保留所有类型定义以确保消费方类型正确，复杂函数降级为 stub。

import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
} from "./string-coerce.js";
import type { CommandExplanationSummary } from "./_openclaw-infra-deps.js";
import type { ExecAllowlistEntry } from "./exec-approvals.types.js";
import type { ExecCommandSegment } from "./exec-approvals-analysis.js";
import { expandHomePrefix, resolveRequiredHomeDir } from "./_openclaw-infra-deps.js";

// Re-export 已移植模块的内容以保持兼容
export * from "./exec-approvals-analysis.js";
export type { ExecAllowlistEntry } from "./exec-approvals.types.js";

// ============================================================================
// 核心类型定义
// ============================================================================

export type ExecHost = "sandbox" | "gateway" | "node";
export type ExecTarget = "auto" | ExecHost;
export type ExecSecurity = "deny" | "allowlist" | "full";
export type ExecAsk = "off" | "on-miss" | "always";
export type ExecMode = "deny" | "allowlist" | "ask" | "auto" | "full";

export const EXEC_TARGET_VALUES: readonly ExecTarget[] = ["auto", "sandbox", "gateway", "node"];

export type SystemRunApprovalBinding = {
  argv: string[];
  cwd: string | null;
  agentId: string | null;
  sessionKey: string | null;
  envHash: string | null;
};

export type SystemRunApprovalFileOperand = {
  argvIndex: number;
  path: string;
  sha256: string;
};

export type SystemRunApprovalPlan = {
  argv: string[];
  cwd: string | null;
  commandText: string;
  commandPreview?: string | null;
  agentId: string | null;
  sessionKey: string | null;
  mutableFileOperand?: SystemRunApprovalFileOperand | null;
};

export type ExecApprovalCommandSpan = {
  startIndex: number;
  endIndex: number;
};

export type ExecApprovalRequestPayload = {
  command: string;
  commandPreview?: string | null;
  commandArgv?: string[];
  envKeys?: string[];
  systemRunBinding?: SystemRunApprovalBinding | null;
  systemRunPlan?: SystemRunApprovalPlan | null;
  cwd?: string | null;
  nodeId?: string | null;
  host?: string | null;
  security?: string | null;
  ask?: string | null;
  warningText?: string | null;
  commandAnalysis?: CommandExplanationSummary | null;
  commandSpans?: ExecApprovalCommandSpan[];
  unavailableDecisions?: readonly ExecApprovalUnavailableDecision[];
  allowedDecisions?: readonly ExecApprovalDecision[];
  agentId?: string | null;
  resolvedPath?: string | null;
  sessionKey?: string | null;
  turnSourceChannel?: string | null;
  turnSourceTo?: string | null;
  turnSourceAccountId?: string | null;
  turnSourceThreadId?: string | number | null;
};

export type ExecApprovalRequest = {
  id: string;
  request: ExecApprovalRequestPayload;
  createdAtMs: number;
  expiresAtMs: number;
};

export type ExecApprovalResolved = {
  id: string;
  decision: ExecApprovalDecision;
  resolvedBy?: string | null;
  ts: number;
  request?: ExecApprovalRequest["request"];
};

export type ExecApprovalsDefaults = {
  security?: ExecSecurity;
  ask?: ExecAsk;
  askFallback?: ExecSecurity;
  autoAllowSkills?: boolean;
};

export type ExecApprovalsAgent = ExecApprovalsDefaults & {
  allowlist?: ExecAllowlistEntry[];
};

export type ExecApprovalsFile = {
  version: 1;
  socket?: {
    path?: string;
    token?: string;
  };
  defaults?: ExecApprovalsDefaults;
  agents?: Record<string, ExecApprovalsAgent>;
};

export type ExecApprovalsSnapshot = {
  path: string;
  exists: boolean;
  raw: string | null;
  file: ExecApprovalsFile;
  hash: string;
};

export type ExecApprovalsResolved = {
  path: string;
  socketPath: string;
  token: string;
  defaults: Required<ExecApprovalsDefaults>;
  agent: Required<ExecApprovalsDefaults>;
  agentSources: {
    security: string | null;
    ask: string | null;
    askFallback: string | null;
  };
  allowlist: ExecAllowlistEntry[];
  file: ExecApprovalsFile;
};

export type ExecApprovalsDefaultOverrides = {
  security?: ExecSecurity;
  ask?: ExecAsk;
  askFallback?: ExecSecurity;
  autoAllowSkills?: boolean;
};

export type ExecApprovalDecision = "allow-once" | "allow-always" | "deny";

export const DEFAULT_EXEC_APPROVAL_DECISIONS: readonly ExecApprovalDecision[] = [
  "allow-once",
  "allow-always",
  "deny",
];

export const OPTIONAL_EXEC_APPROVAL_DECISIONS: readonly string[] = ["allow-always"];

export type ExecApprovalUnavailableDecision = (typeof OPTIONAL_EXEC_APPROVAL_DECISIONS)[number];

export type AllowAlwaysPersistenceReason =
  | "durable-command-approval"
  | "allowlist-entry"
  | "skip";

export type AllowAlwaysPersistenceDecision = {
  reason: AllowAlwaysPersistenceReason;
  patterns: string[];
  commandText?: string | null;
  argPattern?: string | null;
};

// ============================================================================
// 常量
// ============================================================================

export const DEFAULT_EXEC_APPROVAL_TIMEOUT_MS = 1_800_000;
export const DEFAULT_EXEC_APPROVAL_ASK_FALLBACK: ExecSecurity = "deny";

// ============================================================================
// 规范化函数（完整实现）
// ============================================================================

export function normalizeExecHost(value?: string | null): ExecHost | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === "sandbox" || normalized === "gateway" || normalized === "node") {
    return normalized;
  }
  return null;
}

export function normalizeExecTarget(value?: string | null): ExecTarget | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === "auto") {
    return normalized;
  }
  return normalizeExecHost(normalized);
}

export function requireValidExecTarget(value?: unknown): ExecTarget | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new Error(
      `Invalid exec host value type ${typeof value}. Allowed values: ${EXEC_TARGET_VALUES.join(
        ", ",
      )}.`,
    );
  }
  const normalized = normalizeOptionalLowercaseString(value);
  if (!normalized) {
    return null;
  }
  const target = normalizeExecTarget(normalized);
  if (target) {
    return target;
  }
  throw new Error(
    `Invalid exec host "${value}". Allowed values: ${EXEC_TARGET_VALUES.join(", ")}.`,
  );
}

export function normalizeExecSecurity(value?: string | null): ExecSecurity | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === "deny" || normalized === "allowlist" || normalized === "full") {
    return normalized;
  }
  return null;
}

export function normalizeExecAsk(value?: string | null): ExecAsk | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (normalized === "off" || normalized === "on-miss" || normalized === "always") {
    return normalized;
  }
  return null;
}

export function normalizeExecMode(value?: string | null): ExecMode | null {
  const normalized = normalizeOptionalLowercaseString(value);
  if (
    normalized === "deny" ||
    normalized === "allowlist" ||
    normalized === "ask" ||
    normalized === "auto" ||
    normalized === "full"
  ) {
    return normalized;
  }
  return null;
}

export function resolveExecModeFromPolicy(params: {
  security: ExecSecurity;
  ask: ExecAsk;
}): ExecMode {
  if (params.security === "deny") {
    return "deny";
  }
  if (params.security === "full") {
    return "full";
  }
  if (params.ask === "always") {
    return "ask";
  }
  if (params.ask === "on-miss") {
    return "auto";
  }
  return "allowlist";
}

export function resolveExecPolicyForMode(mode: ExecMode): {
  security: ExecSecurity;
  ask: ExecAsk;
} {
  switch (mode) {
    case "deny":
      return { security: "deny", ask: "off" };
    case "allowlist":
      return { security: "allowlist", ask: "off" };
    case "ask":
      return { security: "allowlist", ask: "always" };
    case "auto":
      return { security: "allowlist", ask: "on-miss" };
    case "full":
      return { security: "full", ask: "off" };
  }
}

export function resolveExecModePolicy(params: {
  mode: ExecMode;
  security: ExecSecurity;
  ask: ExecAsk;
}): { mode: ExecMode; security: ExecSecurity; ask: ExecAsk } {
  const policy = resolveExecPolicyForMode(params.mode);
  return {
    mode: params.mode,
    security: policy.security,
    ask: policy.ask,
  };
}

// ============================================================================
// 路径解析（降级实现：基于 home 目录）
// ============================================================================

export function resolveExecApprovalsPath(): string {
  const home = resolveRequiredHomeDir();
  return expandHomePrefix("~/.openclaw/exec-approvals.json", { home });
}

export function resolveExecApprovalsSocketPath(): string {
  const home = resolveRequiredHomeDir();
  return expandHomePrefix("~/.openclaw/run/exec-approvals.sock", { home });
}

export function resolveExecApprovalsDisplayPath(): string {
  return resolveExecApprovalsPath();
}

export function resolveExecApprovalsTranscriptPath(): string {
  const home = resolveRequiredHomeDir();
  return expandHomePrefix("~/.openclaw/run/exec-approvals.transcript.jsonl", { home });
}

// ============================================================================
// 文件 I/O（降级实现：抛出错误或返回默认值）
// ============================================================================

export function normalizeExecApprovals(file: ExecApprovalsFile): ExecApprovalsFile {
  return {
    version: 1,
    socket: file.socket,
    defaults: file.defaults,
    agents: file.agents,
  };
}

export function mergeExecApprovalsSocketDefaults(params: {
  file: ExecApprovalsFile;
  socketPath?: string;
  token?: string;
}): ExecApprovalsFile {
  return params.file;
}

export function readExecApprovalsSnapshot(): ExecApprovalsSnapshot {
  throw new Error("readExecApprovalsSnapshot stub: exec-approvals file I/O not ported");
}

export function loadExecApprovals(): ExecApprovalsFile {
  throw new Error("loadExecApprovals stub: exec-approvals file I/O not ported");
}

export function saveExecApprovals(_file: ExecApprovalsFile): void {
  throw new Error("saveExecApprovals stub: exec-approvals file I/O not ported");
}

export function restoreExecApprovalsSnapshot(_snapshot: ExecApprovalsSnapshot): void {
  throw new Error("restoreExecApprovalsSnapshot stub: exec-approvals file I/O not ported");
}

export function ensureExecApprovals(): ExecApprovalsFile {
  throw new Error("ensureExecApprovals stub: exec-approvals file I/O not ported");
}

// ============================================================================
// 审批解析（降级实现：返回默认值）
// ============================================================================

export function resolveExecApprovals(_params?: {
  cfg?: unknown;
  agentId?: string;
  overrides?: ExecApprovalsDefaultOverrides;
}): ExecApprovalsResolved {
  const defaults: Required<ExecApprovalsDefaults> = {
    security: "full",
    ask: "off",
    askFallback: DEFAULT_EXEC_APPROVAL_ASK_FALLBACK,
    autoAllowSkills: false,
  };
  return {
    path: resolveExecApprovalsPath(),
    socketPath: resolveExecApprovalsSocketPath(),
    token: "",
    defaults,
    agent: defaults,
    agentSources: {
      security: null,
      ask: null,
      askFallback: null,
    },
    allowlist: [],
    file: { version: 1 },
  };
}

export function resolveExecApprovalsFromFile(_params: {
  file: ExecApprovalsFile;
  agentId?: string;
  overrides?: ExecApprovalsDefaultOverrides;
}): ExecApprovalsResolved {
  return resolveExecApprovals();
}

// ============================================================================
// 审批检查（降级实现：返回安全默认值）
// ============================================================================

export function requiresExecApproval(_params: {
  argv: string[];
  cwd?: string | null;
  env?: NodeJS.ProcessEnv;
  agentId?: string;
  cfg?: unknown;
  sessionKey?: string | null;
}): boolean {
  return true;
}

export function commandRequiresSecurityAuditSuppressionApproval(_params: {
  command: string;
  argv?: string[];
}): boolean {
  return false;
}

export function hasDurableExecApproval(_params: {
  argv: string[];
  cwd?: string | null;
  agentId?: string;
  cfg?: unknown;
}): boolean {
  return false;
}

export function hasNodeCommandAllowAlwaysMarker(_params: {
  argv: string[];
}): boolean {
  return false;
}

export function hasExactCommandDurableExecApproval(_params: {
  command: string;
  agentId?: string;
  cfg?: unknown;
}): boolean {
  return false;
}

// ============================================================================
// Allowlist 操作（降级实现：no-op）
// ============================================================================

export function recordAllowlistUse(_params: {
  pattern: string;
  commandText?: string;
  argPattern?: string;
  resolvedPath?: string;
}): void {
  // 降级实现：不记录
}

export function recordAllowlistMatchesUse(_params: {
  matches: ReadonlyArray<{ pattern: string; commandText?: string; argPattern?: string; resolvedPath?: string }>;
}): void {
  // 降级实现：不记录
}

export function addAllowlistEntry(_params: {
  pattern: string;
  source?: "allow-always";
  commandText?: string;
  argPattern?: string;
}): void {
  throw new Error("addAllowlistEntry stub: exec-approvals file I/O not ported");
}

export function addDurableCommandApproval(_params: {
  command: string;
  agentId?: string;
  cfg?: unknown;
}): void {
  throw new Error("addDurableCommandApproval stub: exec-approvals file I/O not ported");
}

export function resolveAllowAlwaysPatternCoverage(_params: {
  command: string;
  argv: string[];
  patterns: string[];
}): { covered: boolean; matchedPatterns: string[] } {
  return { covered: false, matchedPatterns: [] };
}

export function persistAllowAlwaysPatterns(_params: {
  patterns: string[];
  commandText?: string;
  argPattern?: string;
}): void {
  throw new Error("persistAllowAlwaysPatterns stub: exec-approvals file I/O not ported");
}

export function resolveAllowAlwaysPersistenceDecision(_params: {
  command: string;
  argv: string[];
  agentId?: string;
  cfg?: unknown;
}): AllowAlwaysPersistenceDecision {
  return { reason: "skip", patterns: [] };
}

export function persistAllowAlwaysDecision(_params: {
  decision: AllowAlwaysPersistenceDecision;
}): void {
  throw new Error("persistAllowAlwaysDecision stub: exec-approvals file I/O not ported");
}

// ============================================================================
// 工具函数（完整实现）
// ============================================================================

export function minSecurity(a: ExecSecurity, b: ExecSecurity): ExecSecurity {
  const order: ExecSecurity[] = ["deny", "allowlist", "full"];
  return order.indexOf(a) <= order.indexOf(b) ? a : b;
}

export function maxAsk(a: ExecAsk, b: ExecAsk): ExecAsk {
  const order: ExecAsk[] = ["off", "on-miss", "always"];
  return order.indexOf(a) >= order.indexOf(b) ? a : b;
}

// ============================================================================
// 审批决策（完整实现）
// ============================================================================

export function normalizeExecApprovalUnavailableDecisions(
  value: unknown,
): readonly ExecApprovalUnavailableDecision[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is ExecApprovalUnavailableDecision =>
      typeof item === "string" && OPTIONAL_EXEC_APPROVAL_DECISIONS.includes(item),
  );
}

export function resolveExecApprovalAllowedDecisions(_params?: {
  ask?: ExecAsk;
  unavailableDecisions?: readonly ExecApprovalUnavailableDecision[];
}): readonly ExecApprovalDecision[] {
  return DEFAULT_EXEC_APPROVAL_DECISIONS;
}

export function resolveExecApprovalUnavailableDecisions(_params?: {
  cfg?: unknown;
  agentId?: string;
}): readonly ExecApprovalUnavailableDecision[] {
  return [];
}

export function resolveExecApprovalRequestAllowedDecisions(_params?: {
  cfg?: unknown;
  agentId?: string;
  ask?: ExecAsk;
  unavailableDecisions?: readonly ExecApprovalUnavailableDecision[];
}): readonly ExecApprovalDecision[] {
  return DEFAULT_EXEC_APPROVAL_DECISIONS;
}

export function isExecApprovalDecisionAllowed(params: {
  decision: string;
  allowedDecisions?: readonly ExecApprovalDecision[];
}): boolean {
  const allowed = params.allowedDecisions ?? DEFAULT_EXEC_APPROVAL_DECISIONS;
  return allowed.includes(params.decision as ExecApprovalDecision);
}

// ============================================================================
// exec-approvals-allowlist.ts 降级导出
// ============================================================================

export function normalizeSafeBins(entries?: readonly string[]): Set<string> {
  return new Set(
    (entries ?? []).map((entry) => normalizeLowercaseStringOrEmpty(entry)).filter(Boolean),
  );
}

export function resolveSafeBins(entries?: readonly string[] | null): Set<string> {
  return normalizeSafeBins(entries ?? []);
}

export function isSafeBinUsage(_params: {
  executable: string;
  argv?: string[];
  safeBins?: Set<string>;
}): boolean {
  return false;
}

export type ExecAllowlistEvaluation = {
  allowed: boolean;
  reason?: string;
  matchedPatterns?: string[];
};

export type ExecSegmentSatisfiedBy =
  | "allowlist"
  | "safeBins"
  | "inlineChain"
  | "safeBuiltins"
  | "durable"
  | "none";

export type SkillBinTrustEntry = {
  pattern: string;
  skillId: string;
};

export type ExecAllowlistAnalysis = {
  satisfied: boolean;
  satisfiedBy: ExecSegmentSatisfiedBy;
  matchedPatterns: string[];
  segments: Array<{
    argv: string[];
    satisfied: boolean;
    satisfiedBy: ExecSegmentSatisfiedBy;
    matchedPatterns: string[];
  }>;
};

export function evaluateExecAllowlist(_params: {
  command: string;
  argv: string[];
  allowlist?: ExecAllowlistEntry[];
  safeBins?: Set<string>;
  agentId?: string;
}): ExecAllowlistEvaluation {
  return { allowed: false, reason: "exec-approvals-allowlist not ported", matchedPatterns: [] };
}

export type AllowAlwaysPattern = {
  pattern: string;
  commandText?: string;
  argPattern?: string;
  source?: string;
};

export function resolveAllowAlwaysPatternEntries(_params: {
  allowlist?: ExecAllowlistEntry[];
}): AllowAlwaysPattern[] {
  return [];
}

export function resolveAllowAlwaysPatterns(_params: {
  file?: ExecApprovalsFile;
  agentId?: string;
}): AllowAlwaysPattern[] {
  return [];
}

export function evaluateShellAllowlist(_params: {
  command: string;
  segments?: ExecCommandSegment[];
  allowlist?: ExecAllowlistEntry[];
  safeBins?: Set<string>;
}): ExecAllowlistAnalysis {
  return {
    satisfied: false,
    satisfiedBy: "none",
    matchedPatterns: [],
    segments: [],
  };
}
