// Storage-neutral session maintenance operations for the file-backed session store.
//
// 移植自 openclaw/src/config/sessions/store-maintenance-operations.ts
//
// 降级策略：
//  - 原文件依赖 ./disk-budget.js、./store-maintenance-preserve.js、./store-maintenance-runtime.js、
//    ./store-maintenance.js、./types.js。cross-wms 这些模块尚未移植或 API 不同。
//    这里使用本地占位类型和降级函数实现，保持主流程逻辑完整。
//  - SessionEntry 类型使用本地占位定义（cross-wms 的 types.ts schema 不同）。
//  - 降级函数返回 no-op 值（0、null、undefined、空集合），主函数 applyFileBackedSessionStoreMaintenance
//    逻辑保持完整，便于未来 cross-wms 移植依赖模块后恢复完整行为。
import path from "node:path";

/** SessionEntry 占位类型（仅包含本模块用到的字段）。 */
type SessionEntry = {
  sessionId?: string;
  sessionFile?: string;
  updatedAt?: number;
  [key: string]: any;
};

/** 占位：磁盘预算扫描结果。 */
type SessionDiskBudgetSweepResult = {
  removedEntries?: number;
  [key: string]: any;
};

/** 占位：已解析的会话维护配置。 */
type ResolvedSessionMaintenanceConfig = {
  mode: "warn" | "enforce";
  pruneAfterMs: number;
  maxEntries: number;
  resetArchiveRetentionMs?: number | null;
  [key: string]: any;
};

/** 占位：会话维护告警。 */
type SessionMaintenanceWarning = {
  activeSessionKey: string;
  wouldPrune: boolean;
  wouldCap: boolean;
  pruneAfterMs: number;
  maxEntries: number;
};

/** 降级：磁盘预算扫描（不执行任何操作）。 */
async function enforceSessionDiskBudget(_params: {
  store: Record<string, SessionEntry>;
  storePath: string;
  activeSessionKey?: string;
  preserveKeys?: ReadonlySet<string>;
  maintenance: ResolvedSessionMaintenanceConfig;
  warnOnly: boolean;
  log: { warn: (m: string, c?: Record<string, any>) => void; info: (m: string, c?: Record<string, any>) => void };
}): Promise<SessionDiskBudgetSweepResult | null> {
  return null;
}

/** 降级：收集维护保留键（返回空集合）。 */
function collectSessionMaintenancePreserveKeys(_keys: Iterable<string | undefined>): Set<string> {
  return new Set<string>();
}

/** 降级：解析维护配置（返回默认值）。 */
function resolveMaintenanceConfig(): ResolvedSessionMaintenanceConfig {
  return {
    mode: "warn",
    pruneAfterMs: 14 * 24 * 60 * 60 * 1000,
    maxEntries: 1000,
    resetArchiveRetentionMs: null,
  };
}

/** 降级：裁剪条目数量（不执行裁剪）。 */
function capEntryCount(
  _store: Record<string, SessionEntry>,
  _maxEntries: number,
  _options?: { onCapped?: (p: { entry: SessionEntry }) => void; preserveKeys?: Set<string> },
): number {
  return 0;
}

/** 降级：清理过期条目（不执行清理）。 */
function pruneStaleEntries(
  _store: Record<string, SessionEntry>,
  _pruneAfterMs: number,
  _options?: { onPruned?: (p: { entry: SessionEntry }) => void; preserveKeys?: Set<string> },
): number {
  return 0;
}

/** 降级：判断是否需要执行条目维护。 */
function shouldRunSessionEntryMaintenance(_params: {
  entryCount: number;
  maxEntries: number;
  force?: boolean;
}): boolean {
  return false;
}

/** 降级：获取活跃会话维护告警。 */
function getActiveSessionMaintenanceWarning(_params: {
  store: Record<string, SessionEntry>;
  activeSessionKey: string;
  pruneAfterMs: number;
  maxEntries: number;
}): SessionMaintenanceWarning | undefined {
  return undefined;
}

export type SessionMaintenanceApplyReport = {
  mode: ResolvedSessionMaintenanceConfig["mode"];
  beforeCount: number;
  afterCount: number;
  pruned: number;
  capped: number;
  diskBudget: SessionDiskBudgetSweepResult | null;
};

type SessionMaintenanceLogger = {
  warn: (message: string, context?: Record<string, any>) => void;
  info: (message: string, context?: Record<string, any>) => void;
};

type RemovedSessionFiles = Map<string, string | undefined>;

type RemovedSessionArtifactCleanup = {
  archiveRemovedSessionTranscripts: (params: {
    removedSessionFiles: Iterable<[string, string | undefined]>;
    referencedSessionIds: ReadonlySet<string>;
    storePath: string;
    reason: "deleted";
    restrictToStoreDir: true;
  }) => Promise<Set<string>>;
  removeRemovedSessionTrajectoryArtifacts: (params: {
    removedSessionFiles: RemovedSessionFiles;
    referencedSessionIds: ReadonlySet<string>;
    storePath: string;
    restrictToStoreDir: true;
  }) => Promise<void>;
  cleanupArchivedSessionTranscripts: (params: {
    directories: string[];
    rules: Array<{ reason: "deleted" | "reset"; olderThanMs: number }>;
  }) => Promise<void>;
};

export type FileBackedSessionStoreMaintenanceParams = {
  storePath: string;
  store: Record<string, SessionEntry>;
  activeSessionKey?: string;
  onWarn?: (warning: SessionMaintenanceWarning) => void | Promise<void>;
  onMaintenanceApplied?: (report: SessionMaintenanceApplyReport) => void | Promise<void>;
  maintenanceOverride?: Partial<ResolvedSessionMaintenanceConfig>;
  maintenanceConfig?: ResolvedSessionMaintenanceConfig;
  log: SessionMaintenanceLogger;
  artifacts: RemovedSessionArtifactCleanup;
};

export type FileBackedSessionStoreMaintenanceResult = {
  changedStore: boolean;
};

function resolveMaintenanceForOperation(
  params: Pick<
    FileBackedSessionStoreMaintenanceParams,
    "maintenanceConfig" | "maintenanceOverride"
  >,
): ResolvedSessionMaintenanceConfig {
  return params.maintenanceConfig
    ? { ...params.maintenanceConfig, ...params.maintenanceOverride }
    : { ...resolveMaintenanceConfig(), ...params.maintenanceOverride };
}

function collectReferencedSessionIds(store: Record<string, SessionEntry>): Set<string> {
  return new Set(
    Object.values(store)
      .map((entry) => entry?.sessionId)
      .filter((id): id is string => Boolean(id)),
  );
}

function rememberRemovedSessionFile(
  removedSessionFiles: RemovedSessionFiles,
  entry: SessionEntry,
): void {
  if (!removedSessionFiles.has(entry.sessionId ?? "") || entry.sessionFile) {
    removedSessionFiles.set(entry.sessionId ?? "", entry.sessionFile);
  }
}

async function applyWarnOnlyMaintenance(params: {
  operation: FileBackedSessionStoreMaintenanceParams;
  maintenance: ResolvedSessionMaintenanceConfig;
  beforeCount: number;
  shouldRunEntryMaintenance: boolean;
}): Promise<void> {
  const activeSessionKey = params.operation.activeSessionKey?.trim();
  if (activeSessionKey && params.shouldRunEntryMaintenance) {
    const warning = getActiveSessionMaintenanceWarning({
      store: params.operation.store,
      activeSessionKey,
      pruneAfterMs: params.maintenance.pruneAfterMs,
      maxEntries: params.maintenance.maxEntries,
    });
    if (warning) {
      params.operation.log.warn(
        "session maintenance would evict active session; skipping enforcement",
        {
          activeSessionKey: warning.activeSessionKey,
          wouldPrune: warning.wouldPrune,
          wouldCap: warning.wouldCap,
          pruneAfterMs: warning.pruneAfterMs,
          maxEntries: warning.maxEntries,
        },
      );
      await params.operation.onWarn?.(warning);
    }
  }
  const diskBudget = await enforceSessionDiskBudget({
    store: params.operation.store,
    storePath: params.operation.storePath,
    activeSessionKey: params.operation.activeSessionKey,
    maintenance: params.maintenance,
    warnOnly: true,
    log: params.operation.log,
  });
  await params.operation.onMaintenanceApplied?.({
    mode: params.maintenance.mode,
    beforeCount: params.beforeCount,
    afterCount: Object.keys(params.operation.store).length,
    pruned: 0,
    capped: 0,
    diskBudget,
  });
}

async function cleanupRemovedSessionArtifacts(params: {
  operation: FileBackedSessionStoreMaintenanceParams;
  maintenance: ResolvedSessionMaintenanceConfig;
  removedSessionFiles: RemovedSessionFiles;
  referencedSessionIds: ReadonlySet<string>;
}): Promise<void> {
  // SQLite should commit entry-retention rows before this named artifact cleanup.
  // The cleanup needs the final referenced-session set so shared transcripts and
  // trajectory sidecars survive until the last referring row is gone.
  const archivedDirs = await params.operation.artifacts.archiveRemovedSessionTranscripts({
    removedSessionFiles: params.removedSessionFiles,
    referencedSessionIds: params.referencedSessionIds,
    storePath: params.operation.storePath,
    reason: "deleted",
    restrictToStoreDir: true,
  });
  if (params.removedSessionFiles.size > 0) {
    await params.operation.artifacts.removeRemovedSessionTrajectoryArtifacts({
      removedSessionFiles: params.removedSessionFiles,
      referencedSessionIds: params.referencedSessionIds,
      storePath: params.operation.storePath,
      restrictToStoreDir: true,
    });
  }
  if (archivedDirs.size === 0 && params.maintenance.resetArchiveRetentionMs == null) {
    return;
  }
  const targetDirs =
    archivedDirs.size > 0
      ? [...archivedDirs]
      : [path.dirname(path.resolve(params.operation.storePath))];
  // Both retention reasons ride one cleanup call so each save enumerates the
  // sessions dir at most once; reset retention defaults on, so a listing per
  // reason would scan twice per save.
  await params.operation.artifacts.cleanupArchivedSessionTranscripts({
    directories: targetDirs,
    rules:
      params.maintenance.resetArchiveRetentionMs != null
        ? [
            { reason: "deleted", olderThanMs: params.maintenance.pruneAfterMs },
            { reason: "reset", olderThanMs: params.maintenance.resetArchiveRetentionMs },
          ]
        : [{ reason: "deleted", olderThanMs: params.maintenance.pruneAfterMs }],
  });
}

async function applyEnforcedMaintenance(params: {
  operation: FileBackedSessionStoreMaintenanceParams;
  maintenance: ResolvedSessionMaintenanceConfig;
  beforeCount: number;
  forceMaintenance: boolean;
}): Promise<FileBackedSessionStoreMaintenanceResult> {
  const preserveSessionKeys = collectSessionMaintenancePreserveKeys([
    params.operation.activeSessionKey,
  ]);
  const removedSessionFiles = new Map<string, string | undefined>();
  const pruned = pruneStaleEntries(params.operation.store, params.maintenance.pruneAfterMs, {
    onPruned: ({ entry }) => {
      rememberRemovedSessionFile(removedSessionFiles, entry);
    },
    preserveKeys: preserveSessionKeys,
  });
  const countAfterPrune = Object.keys(params.operation.store).length;
  const shouldRunCapMaintenance =
    params.forceMaintenance ||
    shouldRunSessionEntryMaintenance({
      entryCount: countAfterPrune,
      maxEntries: params.maintenance.maxEntries,
    });
  const capped = shouldRunCapMaintenance
    ? capEntryCount(params.operation.store, params.maintenance.maxEntries, {
        onCapped: ({ entry }) => {
          rememberRemovedSessionFile(removedSessionFiles, entry);
        },
        preserveKeys: preserveSessionKeys,
      })
    : 0;
  const referencedSessionIds = collectReferencedSessionIds(params.operation.store);
  await cleanupRemovedSessionArtifacts({
    operation: params.operation,
    maintenance: params.maintenance,
    removedSessionFiles,
    referencedSessionIds,
  });

  // Disk-budget eviction is its own transaction-sized boundary: it may delete
  // additional rows plus owned artifacts after prune/cap has settled, while
  // preserving the active session and protected runtime-provided keys.
  const diskBudget = await enforceSessionDiskBudget({
    store: params.operation.store,
    storePath: params.operation.storePath,
    activeSessionKey: params.operation.activeSessionKey,
    preserveKeys: preserveSessionKeys,
    maintenance: params.maintenance,
    warnOnly: false,
    log: params.operation.log,
  });
  await params.operation.onMaintenanceApplied?.({
    mode: params.maintenance.mode,
    beforeCount: params.beforeCount,
    afterCount: Object.keys(params.operation.store).length,
    pruned,
    capped,
    diskBudget,
  });
  return {
    changedStore: pruned > 0 || capped > 0 || (diskBudget?.removedEntries ?? 0) > 0,
  };
}

/**
 * Applies automatic session-store maintenance to the in-memory file-store image.
 *
 * Future SQLite adapters should map this into named boundaries: entry retention,
 * removed-session artifact cleanup, disk-budget eviction, and archive retention cleanup.
 */
export async function applyFileBackedSessionStoreMaintenance(
  params: FileBackedSessionStoreMaintenanceParams,
): Promise<FileBackedSessionStoreMaintenanceResult> {
  const maintenance = resolveMaintenanceForOperation(params);
  const beforeCount = Object.keys(params.store).length;
  const forceMaintenance = params.maintenanceOverride !== undefined;
  const shouldRunEntryMaintenance = shouldRunSessionEntryMaintenance({
    entryCount: beforeCount,
    maxEntries: maintenance.maxEntries,
    force: forceMaintenance,
  });

  if (maintenance.mode === "warn") {
    await applyWarnOnlyMaintenance({
      operation: params,
      maintenance,
      beforeCount,
      shouldRunEntryMaintenance,
    });
    return { changedStore: false };
  }

  return await applyEnforcedMaintenance({
    operation: params,
    maintenance,
    beforeCount,
    forceMaintenance,
  });
}
