// 提交辅助函数，将临时插件安装记录移动到持久化的安装索引中。
// 移植自 openclaw/src/cli/plugins-install-record-commit.ts。
//
// 降级策略：
//  - 原模块依赖大量 openclaw 内部模块（config/config.js、config/io.js、
//    config/types.openclaw.js、config/types.plugins.js、infra/path-guards.js、
//    plugins/installed-plugin-index-records.js、plugins/managed-npm-retention.js、
//    plugins/uninstall.js）。
//    这些模块在 cross-wms 中尚未移植；这里提供降级实现：
//    提交函数变为 no-op，待处理记录检查始终返回 false，
//    保留函数签名以便未来 cross-wms 移植相关模块后替换为正式实现。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";
import type { PluginInstallRecord } from "./plugins-install-persist.js";

/**
 * Return whether config still contains legacy/transient plugin install records.
 *
 * 降级实现：检查 `config.plugins.installs` 字段是否有键。
 */
export function hasPendingPluginInstallRecords(config: OpenClawConfig): boolean {
  const plugins = (config.plugins ?? {}) as { installs?: Record<string, unknown> };
  return Object.keys(plugins.installs ?? {}).length > 0;
}

/**
 * Find pending install records that match the base config and can be stripped as unchanged.
 *
 * 降级实现：openclaw 使用 `node:util` 的 `isDeepStrictEqual` 进行深度比较。
 * 这里复用相同实现，对 base 与 current 的 installs 字段进行深度严格相等比较。
 */
export function unchangedPendingPluginInstallRecordIds(
  config: OpenClawConfig,
  baseConfig: OpenClawConfig,
): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- isDeepStrictEqual 在 ESM 中通过 node:util 导入更佳，但为避免循环依赖与运行时副作用，这里使用 require。
  const { isDeepStrictEqual } = require("node:util") as typeof import("node:util");
  const pendingInstalls = ((config.plugins ?? {}) as { installs?: Record<string, unknown> }).installs ?? {};
  const baseInstalls = ((baseConfig.plugins ?? {}) as { installs?: Record<string, unknown> }).installs ?? {};
  return Object.entries(baseInstalls)
    .filter(([pluginId, baseInstall]) => isDeepStrictEqual(pendingInstalls[pluginId], baseInstall))
    .map(([pluginId]) => pluginId);
}

/**
 * Remove pending plugin install records from config, optionally only for selected ids.
 *
 * 降级实现：操作 `config.plugins.installs` 字段，移除指定 id 或全部移除。
 */
export function stripPendingPluginInstallRecords(
  config: OpenClawConfig,
  pluginIds?: Iterable<string>,
): OpenClawConfig {
  const plugins = (config.plugins ?? {}) as {
    installs?: Record<string, unknown>;
  };
  if (!pluginIds) {
    if (!plugins.installs) {
      return config;
    }
    const { installs: _installs, ...rest } = plugins;
    void _installs;
    return { ...config, plugins: rest } as OpenClawConfig;
  }
  const removeIds = new Set(pluginIds);
  if (removeIds.size === 0 || !plugins.installs) {
    return config;
  }
  const remainingInstalls = Object.fromEntries(
    Object.entries(plugins.installs).filter(([pluginId]) => !removeIds.has(pluginId)),
  );
  if (Object.keys(remainingInstalls).length === 0) {
    const { installs: _installs, ...rest } = plugins;
    void _installs;
    return { ...config, plugins: rest } as OpenClawConfig;
  }
  return {
    ...config,
    plugins: {
      ...plugins,
      installs: remainingInstalls,
    },
  } as OpenClawConfig;
}

/**
 * Persist plugin install records and commit the matching config update to disk.
 *
 * 降级实现：openclaw 的 config/config.js、plugins/installed-plugin-index-records.js、
 * plugins/managed-npm-retention.js、plugins/uninstall.js 未移植。
 * 这里将提交操作降级为 no-op，仅返回空结果，保留函数签名以便未来替换。
 */
export async function commitPluginInstallRecordsWithConfig(_params: {
  previousInstallRecords?: Record<string, PluginInstallRecord>;
  nextInstallRecords: Record<string, PluginInstallRecord>;
  nextConfig: OpenClawConfig;
  baseHash?: string;
  writeOptions?: unknown;
}): Promise<void> {
  // 降级实现：openclaw 的提交链未移植。
}

/**
 * Commit config while migrating any pending install records into the install index.
 *
 * 降级实现：始终返回 nextConfig 与空 installRecords，movedInstallRecords 为 false。
 */
export async function commitConfigWriteWithPendingPluginInstalls(params: {
  nextConfig: OpenClawConfig;
  writeOptions?: unknown;
  commit?: unknown;
}): Promise<{
  config: OpenClawConfig;
  installRecords: Record<string, PluginInstallRecord>;
  movedInstallRecords: boolean;
  persistedHash: string | null;
}> {
  void params;
  // 降级实现：openclaw 的提交链未移植。
  return {
    config: params.nextConfig,
    installRecords: {},
    movedInstallRecords: false,
    persistedHash: null,
  };
}

/**
 * Replace the config file after moving pending plugin install records into the install index.
 *
 * 降级实现：与 `commitConfigWriteWithPendingPluginInstalls` 一致。
 */
export async function commitConfigWithPendingPluginInstalls(params: {
  nextConfig: OpenClawConfig;
  baseHash?: string;
  writeOptions?: unknown;
}): Promise<{
  config: OpenClawConfig;
  installRecords: Record<string, PluginInstallRecord>;
  movedInstallRecords: boolean;
  persistedHash: string | null;
}> {
  void params;
  // 降级实现：openclaw 的提交链未移植。
  return {
    config: params.nextConfig,
    installRecords: {},
    movedInstallRecords: false,
    persistedHash: null,
  };
}

/**
 * Transform config with retry support while preserving plugin install index consistency.
 *
 * 降级实现：openclaw 的 `transformConfigFileWithRetry` 未移植。
 * 这里将变换操作降级为返回 `{ result: undefined as T, config: params.nextConfig, persistedHash: null }`，
 * 保留函数签名以便未来替换。
 */
export async function transformConfigWithPendingPluginInstalls<T = void>(_params: {
  nextConfig: OpenClawConfig;
  snapshot?: unknown;
  baseHash?: string;
  writeOptions?: unknown;
  afterWrite?: unknown;
  transform?: (config: OpenClawConfig) => Promise<T> | T;
}): Promise<{ result: T | undefined; config: OpenClawConfig | undefined; persistedHash: string | null }> {
  // 降级实现：openclaw 的变换链未移植。
  return { result: undefined, config: undefined, persistedHash: null };
}
