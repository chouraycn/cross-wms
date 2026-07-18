// 移植自 openclaw/src/config/plugin-install-config-migration.ts
// 将 plugin install 配置条目迁移到规范配置形状。
//
// 调整说明：
// 1. 源文件依赖 @openclaw/normalization-core/record-coerce 的 isRecord。此处
//    内联等价实现，与 mcp-config-normalize.ts 等已移植文件的降级策略一致。
// 2. 源文件依赖 ./types.plugins.js 的 PluginInstallRecord 类型。cross-wms 该
//    类型位于 ./types/plugins.js。
import { z } from 'zod';
import type { PluginInstallRecord } from './types/plugins.js';
import { PluginInstallRecordShape } from './zod-schema-installs.js';

// 降级说明：内联 isRecord，等价于 @openclaw/normalization-core/record-coerce 导出。
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const PluginInstallRecordsSchema = z.record(
  z.string(),
  z.object(PluginInstallRecordShape).passthrough(),
);

function pruneEmptyPluginsObject(plugins: Record<string, unknown>): unknown {
  const { installs: _installs, ...rest } = plugins;
  return Object.keys(rest).length === 0 ? undefined : rest;
}

/**
 * 读取遗留的 shipped `plugins.installs` 记录以迁移到 plugin 索引。
 *
 * 无效的 install 映射被忽略，使配置加载可继续使用剥离后的运行时配置，
 * 而 doctor/write 路径决定如何报告或恢复。
 */
export function extractShippedPluginInstallConfigRecords(
  config: unknown,
): Record<string, PluginInstallRecord> {
  if (!isRecord(config) || !isRecord(config.plugins)) {
    return {};
  }
  const parsed = PluginInstallRecordsSchema.safeParse(config.plugins.installs);
  return parsed.success
    ? (structuredClone(parsed.data) as Record<string, PluginInstallRecord>)
    : {};
}

/** 移除遗留的 shipped `plugins.installs`，不修改原始配置对象。 */
export function stripShippedPluginInstallConfigRecords(config: unknown): unknown {
  if (!isRecord(config) || !isRecord(config.plugins) || !('installs' in config.plugins)) {
    return config;
  }
  const plugins = pruneEmptyPluginsObject(config.plugins);
  const { plugins: _plugins, ...rest } = config;
  return plugins === undefined ? rest : { ...rest, plugins };
}
