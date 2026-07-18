// Resolves filesystem paths for installed plugin index storage.
//
// 移植自 openclaw/src/plugins/installed-plugin-index-store-path.ts。
//
// 降级策略：
//  - 原文件依赖 ../config/paths.js 的 resolveStateDir。cross-wms 尚未移植
//    该模块。这里内联降级实现：从 env.OPENCLAW_STATE_DIR 读取，回退到
//    ~/.openclaw/state 目录。
//  - 原文件依赖 ../state/openclaw-state-db.js 的 OpenClawStateDatabaseOptions。
//    cross-wms 尚未移植该模块。这里定义本地最小结构占位。
//  - 原文件依赖 ../state/openclaw-state-db.paths.js 的
//    resolveOpenClawStateSqlitePath。cross-wms 尚未移植该模块。这里内联降级
//    实现：返回 stateDir 下的 openclaw-state.sqlite 路径。

import path from "node:path";
import os from "node:os";

// ============================================================================
// 内联降级：../state/openclaw-state-db.js —— OpenClawStateDatabaseOptions
// ============================================================================

/**
 * OpenClaw 状态数据库选项（降级占位）。
 *
 * 降级原因：cross-wms 的 state/openclaw-state-db.js 尚未移植。
 * 这里定义与 openclaw OpenClawStateDatabaseOptions 结构兼容的最小类型。
 */
export type OpenClawStateDatabaseOptions = {
  env?: NodeJS.ProcessEnv;
  path?: string;
};

// ============================================================================
// 内联降级：../config/paths.js —— resolveStateDir
// ============================================================================

/**
 * 解析 OpenClaw 状态目录。
 *
 * 降级说明：cross-wms 的 config/paths.js 尚未移植。openclaw 原版从
 * env.OPENCLAW_STATE_DIR 读取，回退到平台默认目录。这里内联实现
 * 相同逻辑：优先 env.OPENCLAW_STATE_DIR，否则回退到 ~/.openclaw/state。
 */
function resolveStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = typeof env.OPENCLAW_STATE_DIR === "string" ? env.OPENCLAW_STATE_DIR.trim() : "";
  if (fromEnv) {
    return path.resolve(fromEnv);
  }
  return path.join(os.homedir(), ".openclaw", "state");
}

// ============================================================================
// 内联降级：../state/openclaw-state-db.paths.js —— resolveOpenClawStateSqlitePath
// ============================================================================

/**
 * 解析 OpenClaw 状态 SQLite 数据库路径。
 *
 * 降级说明：cross-wms 的 state/openclaw-state-db.paths.js 尚未移植。
 * openclaw 原版返回 stateDir 下的 openclaw-state.sqlite 路径。这里内联
 * 实现相同逻辑。
 */
function resolveOpenClawStateSqlitePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolveStateDir(env), "openclaw-state.sqlite");
}

// ============================================================================
// installed-plugin-index-store-path 实现
// ============================================================================

const LEGACY_INSTALLED_PLUGIN_INDEX_STORE_PATH = path.join("plugins", "installs.json");

/** Options for resolving installed plugin index storage paths. */
export type InstalledPluginIndexStoreOptions = {
  env?: NodeJS.ProcessEnv;
  stateDir?: string;
  filePath?: string;
};

function resolveStoreEnv(options: InstalledPluginIndexStoreOptions): NodeJS.ProcessEnv {
  return options.stateDir
    ? { ...(options.env ?? process.env), OPENCLAW_STATE_DIR: options.stateDir }
    : (options.env ?? process.env);
}

/** Resolves the canonical SQLite-backed installed plugin index path. */
export function resolveInstalledPluginIndexStorePath(
  options: InstalledPluginIndexStoreOptions = {},
): string {
  if (options.filePath) {
    return options.filePath;
  }
  return resolveOpenClawStateSqlitePath(resolveStoreEnv(options));
}

/** Resolves state database options for the installed plugin index store. */
export function resolveInstalledPluginIndexStateDatabaseOptions(
  options: InstalledPluginIndexStoreOptions = {},
): OpenClawStateDatabaseOptions {
  if (options.filePath) {
    return {
      ...(options.env ? { env: options.env } : {}),
      path: options.filePath,
    };
  }
  if (options.stateDir) {
    return {
      env: resolveStoreEnv(options),
    };
  }
  return options.env ? { env: options.env } : {};
}

/** Resolves the legacy JSON installed plugin index path for migration/doctor use. */
export function resolveLegacyInstalledPluginIndexStorePath(
  options: InstalledPluginIndexStoreOptions = {},
): string {
  if (options.filePath) {
    return options.filePath;
  }
  const env = options.env ?? process.env;
  const stateDir = options.stateDir ?? resolveStateDir(env);
  return path.join(stateDir, LEGACY_INSTALLED_PLUGIN_INDEX_STORE_PATH);
}
