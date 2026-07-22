/**
 * Plugin Utils — 插件 SDK 工具函数
 *
 * 提供通用的工具函数，被 SDK 各模块复用。
 * 与 ./shared.ts 互补：
 * - shared.ts 是 OpenClaw 移植的共享工具
 * - 本文件是 SDK 层新增的工具函数
 */

import type { PluginManifest, PluginCapabilityKind } from './types.js';
import { parseVersion, compareVersions } from './loader.js';
import { ALL_CAPABILITY_KINDS, HIGH_RISK_CAPABILITIES } from './plugin-constants.js';

// ===================== ID 工具 =====================

/** 生成唯一 ID */
export function generateId(prefix = 'plugin'): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}${random}`;
}

/** 验证插件 ID 格式 */
export function isValidPluginId(id: string): boolean {
  return /^[a-z][a-z0-9_-]*$/.test(id);
}

/** 从包名生成插件 ID */
export function pluginIdFromPackageName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ===================== Manifest 工具 =====================

/** 获取 manifest 的显示名 */
export function getDisplayName(manifest: PluginManifest): string {
  return manifest.displayName ?? manifest.name ?? manifest.id;
}

/** 获取 manifest 的入口路径 */
export function getEntryPath(manifest: PluginManifest): string {
  return manifest.entry ?? manifest.entrypoint ?? 'index.js';
}

/** 获取 manifest 的描述 */
export function getDescription(manifest: PluginManifest): string {
  return manifest.description ?? '';
}

/** 检查 manifest 是否声明了某能力 */
export function hasCapability(manifest: PluginManifest, capability: PluginCapabilityKind): boolean {
  return manifest.capabilities?.includes(capability) ?? false;
}

/** 检查 manifest 是否为高风险 */
export function isHighRisk(manifest: PluginManifest): boolean {
  if (manifest.riskLevel === 'high-risk') return true;
  if (manifest.capabilities?.some((c) => HIGH_RISK_CAPABILITIES.includes(c))) return true;
  return false;
}

/** 获取 manifest 的工具名列表 */
export function getToolNames(manifest: PluginManifest): string[] {
  return manifest.tools?.map((t) => t.name) ?? [];
}

// ===================== 版本工具 =====================

/** 格式化版本号 */
export function formatVersion(version: { major: number; minor: number; patch: number; prerelease?: string }): string {
  const base = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease ? `${base}-${version.prerelease}` : base;
}

/** 简化版本号（去掉预发布标识） */
export function simplifyVersion(version: string): string {
  const parsed = parseVersion(version);
  return formatVersion({ major: parsed.major, minor: parsed.minor, patch: parsed.patch });
}

/** 获取主版本号 */
export function getMajorVersion(version: string): number {
  return parseVersion(version).major;
}

/** 比较版本号（字符串形式） */
export function compareVersionStrings(a: string, b: string): number {
  return compareVersions(parseVersion(a), parseVersion(b));
}

/** 获取最新版本 */
export function getLatestVersion(versions: string[]): string | undefined {
  if (versions.length === 0) return undefined;
  return versions.reduce((latest, current) => {
    return compareVersionStrings(current, latest) > 0 ? current : latest;
  });
}

// ===================== 能力工具 =====================

/** 获取所有合法能力种类 */
export function getAllCapabilityKinds(): readonly PluginCapabilityKind[] {
  return ALL_CAPABILITY_KINDS;
}

/** 检查能力是否合法 */
export function isValidCapabilityKind(kind: string): kind is PluginCapabilityKind {
  return (ALL_CAPABILITY_KINDS as readonly string[]).includes(kind);
}

/** 检查能力是否高风险 */
export function isHighRiskCapability(kind: PluginCapabilityKind): boolean {
  return HIGH_RISK_CAPABILITIES.includes(kind);
}

/** 过滤合法能力 */
export function filterValidCapabilities(kinds: string[]): PluginCapabilityKind[] {
  return kinds.filter(isValidCapabilityKind);
}

// ===================== 路径工具 =====================

/** 规范化插件路径 */
export function normalizePluginPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/');
}

/** 获取插件根目录名 */
export function getPluginDirName(manifest: PluginManifest): string {
  return manifest.id.replace(/[^a-z0-9_-]/g, '-');
}

/** 拼接插件安装路径 */
export function joinPluginPath(baseDir: string, pluginId: string): string {
  return `${normalizePluginPath(baseDir)}/${getPluginDirName({ id: pluginId, name: pluginId, version: '0.0.0' } as PluginManifest)}`;
}

// ===================== 转换工具 =====================

/** 将 manifest 转为摘要 */
export function manifestToSummary(manifest: PluginManifest): {
  id: string;
  name: string;
  version: string;
  description: string;
  capabilities: PluginCapabilityKind[];
  toolCount: number;
  riskLevel: string;
} {
  return {
    id: manifest.id,
    name: getDisplayName(manifest),
    version: manifest.version,
    description: getDescription(manifest),
    capabilities: manifest.capabilities ?? [],
    toolCount: manifest.tools?.length ?? 0,
    riskLevel: manifest.riskLevel ?? 'auto',
  };
}

// 注意：serializeManifest / deserializeManifest 已在 ./plugin-manifest.js 中定义，
// 此处不再重复导出以避免 TS2308 冲突。下游请从 ./plugin-manifest.js 导入。

// ===================== 集合工具 =====================

/** 按 ID 去重 */
export function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** 按 key 分组 */
export function groupBy<T, K extends string | number>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result;
}

/** 分页 */
export function paginate<T>(items: T[], page: number, pageSize: number): { data: T[]; total: number; page: number; pageSize: number; hasMore: boolean } {
  const total = items.length;
  const offset = (page - 1) * pageSize;
  const data = items.slice(offset, offset + pageSize);
  return {
    data,
    total,
    page,
    pageSize,
    hasMore: offset + pageSize < total,
  };
}
