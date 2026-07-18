// 应用跨 OpenClaw 配置文件的持久化 state 迁移。
//
// 降级说明：
//  - 本模块在 openclaw 中依赖大量未移植的子系统（acp/agents/channels/config/
//    plugin-state/plugins/routing/sessions/state-db），共 5356 行。
//  - cross-wms 未移植这些子系统，因此所有迁移函数降级为返回空结果/默认值。
//  - 保留类型定义与 `sessionStoreTextMayNeedCanonicalization` 的纯逻辑实现。
//  - `LegacyStateDetection` 保留为宽松类型，避免阻塞调用方编译。
import type { OpenClawConfig } from "./_runtime-stubs.js";

// ============================================================================
// 类型定义
// ============================================================================

/** Session 作用域（降级为宽松字符串字面量联合） */
// eslint-disable-next-line @typescript-eslint/ban-types
export type SessionScope = "global" | "agent" | "channel" | "group" | (string & {});

/** 迁移日志器 */
export type MigrationLogger = {
  info: (message: string) => void;
  warn: (message: string) => void;
};

/** State 目录迁移结果 */
export type StateDirMigrationResult = {
  migrated: boolean;
  skipped: boolean;
  changes: string[];
  warnings: string[];
};

/** 旧版 state 检测结果（降级为宽松结构，避免依赖未移植的 channel/plugin 类型） */
export type LegacyStateDetection = {
  targetAgentId: string;
  targetMainKey: string;
  targetScope?: SessionScope;
  stateDir: string;
  oauthDir: string;
  sessions: {
    legacyDir: string;
    legacyStorePath: string;
    targetDir: string;
    targetStorePath: string;
    hasLegacy: boolean;
    legacyKeys: string[];
  };
  agentDir: {
    legacyDir: string;
    targetDir: string;
    hasLegacy: boolean;
  };
  channelPlans: {
    hasLegacy: boolean;
    plans: unknown[];
  };
  pluginPlans?: {
    hasLegacy: boolean;
    plans: unknown[];
  };
  pluginStateSidecar: {
    sourcePath: string;
    hasLegacy: boolean;
  };
  pluginInstallIndex: {
    sourcePath: string;
    hasLegacy: boolean;
  };
  debugProxyCaptureSidecar: {
    sourcePath: string;
    blobDir: string;
    hasLegacy: boolean;
  };
  stateSchema: {
    hasLegacy: boolean;
    preview: string[];
  };
  taskStateSidecars: {
    taskRunsPath: string;
    flowRunsPath: string;
    hasLegacy: boolean;
  };
  deliveryQueues: {
    outboundPath: string;
    sessionPath: string;
    hasLegacy: boolean;
  };
  voiceWake: {
    triggersPath: string;
    routingPath: string;
    hasLegacy: boolean;
  };
  updateCheck: {
    sourcePath: string;
    hasLegacy: boolean;
  };
  configHealth: {
    sourcePath: string;
    hasLegacy: boolean;
  };
  pluginBindingApprovals: {
    sourcePath: string;
    hasLegacy: boolean;
  };
  currentConversationBindings: {
    sourcePath: string;
    hasLegacy: boolean;
  };
  execApprovals: {
    sourcePath: string;
    targetPath: string;
    hasLegacy: boolean;
  };
  preview: string[];
};

// ============================================================================
// 常量（来自 ../routing/session-key.js，内联降级）
// ============================================================================

const DEFAULT_AGENT_ID = "default";
const DEFAULT_MAIN_KEY = "main";

/** 将字符串规范化为小写或空字符串（来自 normalization-core/string-coerce） */
function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toLowerCase();
}

// ============================================================================
// 自动迁移状态（降级：始终跳过）
// ============================================================================

let autoMigrateChecked = false;
let autoMigrateStateDirChecked = false;
let autoMigrateTaskStateSidecarsChecked = false;

// ============================================================================
// sessionStoreTextMayNeedCanonicalization —— 纯逻辑，可完整移植
// ============================================================================

/** 列出 session store 文本中的顶层键（简化实现） */
function listTopLevelSessionStoreKeys(raw: string): string[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed as Record<string, unknown>);
    }
  } catch {
    return null;
  }
  return null;
}

/** 规范化 agent id（降级：trim + lowercase） */
function normalizeAgentId(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_AGENT_ID;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || DEFAULT_AGENT_ID;
}

/** 检测 session store 文本是否需要规范化。 */
export function sessionStoreTextMayNeedCanonicalization(params: {
  raw: string;
  storeAgentIds: Iterable<string>;
  mainKey: string;
  scope?: SessionScope;
}): boolean {
  const keys = listTopLevelSessionStoreKeys(params.raw);
  if (!keys) {
    return true;
  }
  const storeAgentIds = new Set([...params.storeAgentIds].map((id) => normalizeAgentId(id)));
  const hasNonMainAgent = [...storeAgentIds].some((id) => id !== DEFAULT_AGENT_ID);
  for (const key of keys) {
    const rawKey = key.trim();
    if (rawKey !== key) {
      return true;
    }
    if (!rawKey) {
      continue;
    }
    const lowerKey = normalizeLowercaseStringOrEmpty(rawKey);
    if (lowerKey !== rawKey) {
      return true;
    }
    if (lowerKey === "global" || lowerKey === "unknown") {
      continue;
    }
    if (lowerKey === DEFAULT_MAIN_KEY || lowerKey === params.mainKey) {
      return true;
    }
    if (lowerKey.startsWith("subagent:")) {
      return true;
    }
    if (lowerKey.startsWith("group:") || lowerKey.startsWith("channel:")) {
      return true;
    }
    if (!lowerKey.startsWith("agent:")) {
      return true;
    }
    for (const storeAgentId of storeAgentIds) {
      const agentMainAlias = `agent:${storeAgentId}:${DEFAULT_MAIN_KEY}`;
      const agentMainKey = `agent:${storeAgentId}:${params.mainKey}`;
      if (
        lowerKey === agentMainAlias &&
        (params.mainKey !== DEFAULT_MAIN_KEY || params.scope === "global")
      ) {
        return true;
      }
      if (lowerKey === agentMainKey && params.scope === "global") {
        return true;
      }
    }
    if (
      lowerKey === `agent:${DEFAULT_AGENT_ID}:${DEFAULT_MAIN_KEY}` &&
      (params.mainKey !== DEFAULT_MAIN_KEY || hasNonMainAgent || params.scope === "global")
    ) {
      return true;
    }
    if (
      lowerKey === `agent:${DEFAULT_AGENT_ID}:${params.mainKey}` &&
      hasNonMainAgent &&
      !storeAgentIds.has(DEFAULT_AGENT_ID)
    ) {
      return true;
    }
  }
  return false;
}

// ============================================================================
// 测试辅助 —— 重置自动迁移状态
// ============================================================================

export function resetAutoMigrateLegacyStateForTest() {
  autoMigrateChecked = false;
  autoMigrateTaskStateSidecarsChecked = false;
}

export function resetAutoMigrateLegacyStateDirForTest() {
  autoMigrateStateDirChecked = false;
}

export function resetAutoMigrateLegacyTaskStateSidecarsForTest() {
  autoMigrateTaskStateSidecarsChecked = false;
}

// ============================================================================
// 迁移函数 —— 全部降级为空结果
// ============================================================================

/** 自动迁移旧版 state 目录（降级：直接返回跳过）。 */
export async function autoMigrateLegacyStateDir(params: {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  log?: MigrationLogger;
}): Promise<StateDirMigrationResult> {
  if (autoMigrateStateDirChecked) {
    return { migrated: false, skipped: true, changes: [], warnings: [] };
  }
  autoMigrateStateDirChecked = true;
  // 降级：未移植 channel/plugin/state-db 子系统，直接跳过。
  return { migrated: false, skipped: true, changes: [], warnings: [] };
}

/** 自动迁移旧版 task state sidecars（降级：直接返回跳过）。 */
export async function autoMigrateLegacyTaskStateSidecars(params: {
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  log?: MigrationLogger;
}): Promise<StateDirMigrationResult> {
  if (autoMigrateTaskStateSidecarsChecked) {
    return { migrated: false, skipped: true, changes: [], warnings: [] };
  }
  autoMigrateTaskStateSidecarsChecked = true;
  // 降级：未移植 task state 子系统，直接跳过。
  return { migrated: false, skipped: true, changes: [], warnings: [] };
}

/** 检测旧版 state 迁移（降级：返回空检测结果）。 */
export async function detectLegacyStateMigrations(params: {
  cfg: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}): Promise<LegacyStateDetection> {
  // 降级：未移植 config/channel/plugin 子系统，返回无 legacy 的空检测。
  const emptySessions = {
    legacyDir: "",
    legacyStorePath: "",
    targetDir: "",
    targetStorePath: "",
    hasLegacy: false,
    legacyKeys: [] as string[],
  };
  return {
    targetAgentId: DEFAULT_AGENT_ID,
    targetMainKey: DEFAULT_MAIN_KEY,
    stateDir: "",
    oauthDir: "",
    sessions: emptySessions,
    agentDir: { legacyDir: "", targetDir: "", hasLegacy: false },
    channelPlans: { hasLegacy: false, plans: [] },
    pluginStateSidecar: { sourcePath: "", hasLegacy: false },
    pluginInstallIndex: { sourcePath: "", hasLegacy: false },
    debugProxyCaptureSidecar: { sourcePath: "", blobDir: "", hasLegacy: false },
    stateSchema: { hasLegacy: false, preview: [] },
    taskStateSidecars: { taskRunsPath: "", flowRunsPath: "", hasLegacy: false },
    deliveryQueues: { outboundPath: "", sessionPath: "", hasLegacy: false },
    voiceWake: { triggersPath: "", routingPath: "", hasLegacy: false },
    updateCheck: { sourcePath: "", hasLegacy: false },
    configHealth: { sourcePath: "", hasLegacy: false },
    pluginBindingApprovals: { sourcePath: "", hasLegacy: false },
    currentConversationBindings: { sourcePath: "", hasLegacy: false },
    execApprovals: { sourcePath: "", targetPath: "", hasLegacy: false },
    preview: [],
  };
}

/** 迁移旧版 agent 目录（降级：返回空结果）。 */
export async function migrateLegacyAgentDir(
  detected: LegacyStateDetection,
  now: () => number,
): Promise<{ changes: string[]; warnings: string[] }> {
  // 降级：未移植 agent/sessions 子系统。
  void detected;
  void now;
  return { changes: [], warnings: [] };
}

/** 运行旧版 state 迁移（降级：返回空结果）。 */
export async function runLegacyStateMigrations(params: {
  detected: LegacyStateDetection;
  config?: OpenClawConfig;
  now?: () => number;
  recoverCorruptTargetStore?: boolean;
}): Promise<{ changes: string[]; warnings: string[] }> {
  // 降级：未移植 state-db/channel/plugin 子系统。
  void params;
  return { changes: [], warnings: [] };
}

/** 迁移孤立 session keys（降级：返回空结果）。 */
export async function migrateOrphanedSessionKeys(params: {
  cfg: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
}): Promise<{ changes: string[]; warnings: string[] }> {
  // 降级：未移植 routing/sessions 子系统。
  void params;
  return { changes: [], warnings: [] };
}

/** 自动迁移旧版 state（降级：返回跳过）。 */
export async function autoMigrateLegacyState(params: {
  cfg: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
  log?: MigrationLogger;
  now?: () => number;
  recoverCorruptTargetStore?: boolean;
}): Promise<{
  migrated: boolean;
  skipped: boolean;
  changes: string[];
  warnings: string[];
}> {
  if (autoMigrateChecked) {
    return { migrated: false, skipped: true, changes: [], warnings: [] };
  }
  autoMigrateChecked = true;
  // 降级：未移植完整子系统链，直接跳过。
  return { migrated: false, skipped: true, changes: [], warnings: [] };
}
