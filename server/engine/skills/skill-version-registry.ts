/**
 * 技能版本管理
 *
 * 借鉴 OpenClaw 的 skill-versioning 模式：
 * - 维护技能版本目录（SemVer 风格：major.minor.patch）
 * - 支持多版本并存（旧版本仍可调用）
 * - 提供版本兼容性检查
 * - 提供版本升级/回退
 * - 支持版本别名（latest / stable / experimental）
 */

import type { SkillEntry } from './types.js';

/** 版本号（SemVer 简化版） */
export interface SkillVersion {
  major: number;
  minor: number;
  patch: number;
  /** 预发布标识（如 alpha.1 / beta.2） */
  prerelease?: string;
}

/** 版本化技能条目 */
export interface VersionedSkillEntry {
  /** 技能名称 */
  name: string;
  /** 版本 */
  version: SkillVersion;
  /** 原始版本字符串 */
  versionString: string;
  /** 关联的 SkillEntry */
  entry: SkillEntry;
  /** 注册时间戳 */
  registeredAt: number;
  /** 状态 */
  status: 'active' | 'deprecated' | 'yanked';
}

/** 版本别名 */
export interface SkillVersionAlias {
  /** 别名字符串（如 'latest'、'stable'） */
  alias: string;
  /** 技能名 */
  name: string;
  /** 别名指向的版本 */
  version: SkillVersion;
  /** 更新时间戳 */
  updatedAt: number;
}

/** 兼容性范围 */
export interface VersionRange {
  /** 最低版本（含） */
  min?: SkillVersion;
  /** 最高版本（不含） */
  max?: SkillVersion;
  /** 兼容的主版本号列表（如 [1, 2]） */
  compatibleMajors?: number[];
}

/** 版本解析结果 */
export interface VersionParseResult {
  success: boolean;
  version?: SkillVersion;
  error?: string;
}

/** 配置 */
export interface SkillVersionRegistryOptions {
  /** 默认别名指向版本时是否自动激活 */
  autoActivateAlias?: boolean;
}

export class SkillVersionRegistry {
  /** name -> versionString -> VersionedSkillEntry */
  private versions = new Map<string, Map<string, VersionedSkillEntry>>();
  /** name -> alias -> SkillVersionAlias */
  private aliases = new Map<string, Map<string, SkillVersionAlias>>();
  private options: SkillVersionRegistryOptions;

  constructor(options?: SkillVersionRegistryOptions) {
    this.options = { autoActivateAlias: true, ...options };
  }

  /** 注册一个版本 */
  register(name: string, version: string, entry: SkillEntry): { success: boolean; error?: string } {
    const parsed = parseVersion(version);
    if (!parsed.success || !parsed.version) {
      return { success: false, error: parsed.error };
    }

    let skillVersions = this.versions.get(name);
    if (!skillVersions) {
      skillVersions = new Map();
      this.versions.set(name, skillVersions);
    }

    if (skillVersions.has(version)) {
      return { success: false, error: `Version ${version} of skill "${name}" already registered` };
    }

    const versioned: VersionedSkillEntry = {
      name,
      version: parsed.version,
      versionString: version,
      entry,
      registeredAt: Date.now(),
      status: 'active',
    };
    skillVersions.set(version, versioned);

    return { success: true };
  }

  /** 注销一个版本 */
  unregister(name: string, version: string): boolean {
    const skillVersions = this.versions.get(name);
    if (!skillVersions) return false;
    return skillVersions.delete(version);
  }

  /** 获取指定版本的技能 */
  getVersion(name: string, version: string): VersionedSkillEntry | undefined {
    return this.versions.get(name)?.get(version);
  }

  /** 通过别名获取技能版本 */
  resolveByAlias(name: string, alias: string): VersionedSkillEntry | undefined {
    const aliasEntry = this.aliases.get(name)?.get(alias);
    if (!aliasEntry) return undefined;
    const versionStr = formatVersion(aliasEntry.version);
    return this.getVersion(name, versionStr);
  }

  /** 设置版本别名 */
  setAlias(name: string, alias: string, version: string): { success: boolean; error?: string } {
    const entry = this.getVersion(name, version);
    if (!entry) {
      return { success: false, error: `Version ${version} of skill "${name}" not found` };
    }

    let skillAliases = this.aliases.get(name);
    if (!skillAliases) {
      skillAliases = new Map();
      this.aliases.set(name, skillAliases);
    }

    skillAliases.set(alias, {
      alias,
      name,
      version: entry.version,
      updatedAt: Date.now(),
    });

    return { success: true };
  }

  /** 移除别名 */
  removeAlias(name: string, alias: string): boolean {
    return this.aliases.get(name)?.delete(alias) ?? false;
  }

  /** 获取别名列表 */
  getAliases(name: string): SkillVersionAlias[] {
    const map = this.aliases.get(name);
    if (!map) return [];
    return Array.from(map.values());
  }

  /** 列出技能的所有版本 */
  listVersions(name: string): VersionedSkillEntry[] {
    const map = this.versions.get(name);
    if (!map) return [];
    return Array.from(map.values()).sort((a, b) => compareVersions(a.version, b.version));
  }

  /** 获取最新版本（按 SemVer 排序） */
  getLatest(name: string): VersionedSkillEntry | undefined {
    const versions = this.listVersions(name);
    // 优先返回非预发布版本
    const stable = versions.filter((v) => !v.version.prerelease);
    if (stable.length > 0) return stable[stable.length - 1];
    return versions[versions.length - 1];
  }

  /** 获取最新稳定版本 */
  getLatestStable(name: string): VersionedSkillEntry | undefined {
    const versions = this.listVersions(name).filter((v) => !v.version.prerelease && v.status === 'active');
    return versions[versions.length - 1];
  }

  /** 标记版本状态 */
  setStatus(name: string, version: string, status: VersionedSkillEntry['status']): boolean {
    const entry = this.getVersion(name, version);
    if (!entry) return false;
    entry.status = status;
    return true;
  }

  /** 检查版本兼容性 */
  isCompatible(name: string, version: string, range: VersionRange): boolean {
    const entry = this.getVersion(name, version);
    if (!entry) return false;

    const v = entry.version;

    if (range.compatibleMajors && !range.compatibleMajors.includes(v.major)) {
      return false;
    }
    if (range.min && compareVersions(v, range.min) < 0) {
      return false;
    }
    if (range.max && compareVersions(v, range.max) >= 0) {
      return false;
    }
    return true;
  }

  /** 查找在指定范围内的所有版本 */
  findInrange(name: string, range: VersionRange): VersionedSkillEntry[] {
    return this.listVersions(name).filter((v) => {
      if (range.compatibleMajors && !range.compatibleMajors.includes(v.version.major)) return false;
      if (range.min && compareVersions(v.version, range.min) < 0) return false;
      if (range.max && compareVersions(v.version, range.max) >= 0) return false;
      return true;
    });
  }

  /** 获取所有已注册技能名称 */
  getRegisteredNames(): string[] {
    return Array.from(this.versions.keys());
  }

  /** 获取全局统计 */
  getStats(): {
    totalSkills: number;
    totalVersions: number;
    activeVersions: number;
    deprecatedVersions: number;
    yankedVersions: number;
    totalAliases: number;
  } {
    let totalVersions = 0;
    let active = 0;
    let deprecated = 0;
    let yanked = 0;
    let totalAliases = 0;

    for (const map of this.versions.values()) {
      totalVersions += map.size;
      for (const v of map.values()) {
        if (v.status === 'active') active++;
        else if (v.status === 'deprecated') deprecated++;
        else if (v.status === 'yanked') yanked++;
      }
    }
    for (const map of this.aliases.values()) {
      totalAliases += map.size;
    }

    return {
      totalSkills: this.versions.size,
      totalVersions,
      activeVersions: active,
      deprecatedVersions: deprecated,
      yankedVersions: yanked,
      totalAliases,
    };
  }

  /** 清空所有数据 */
  clear(): void {
    this.versions.clear();
    this.aliases.clear();
  }
}

/**
 * 解析版本字符串（SemVer 简化版）
 *
 * 支持格式：
 * - 1.0.0
 * - 1.0.0-alpha.1
 * - 1.0.0+build.123（忽略 build metadata）
 * - v1.0.0（带 v 前缀）
 */
export function parseVersion(input: string): VersionParseResult {
  if (!input || typeof input !== 'string') {
    return { success: false, error: 'Version string is empty' };
  }

  let trimmed = input.trim();
  if (trimmed.startsWith('v') || trimmed.startsWith('V')) {
    trimmed = trimmed.slice(1);
  }

  // 移除 build metadata
  const plusIdx = trimmed.indexOf('+');
  if (plusIdx !== -1) {
    trimmed = trimmed.slice(0, plusIdx);
  }

  // 提取 prerelease
  let prerelease: string | undefined;
  const dashIdx = trimmed.indexOf('-');
  if (dashIdx !== -1) {
    prerelease = trimmed.slice(dashIdx + 1);
    trimmed = trimmed.slice(0, dashIdx);
  }

  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return { success: false, error: `Invalid version format: ${input}` };
  }

  const major = parseInt(parts[0], 10);
  const minor = parseInt(parts[1], 10);
  const patch = parseInt(parts[2], 10);

  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    return { success: false, error: `Invalid version numbers: ${input}` };
  }
  if (major < 0 || minor < 0 || patch < 0) {
    return { success: false, error: `Version numbers must be non-negative: ${input}` };
  }

  return {
    success: true,
    version: { major, minor, patch, prerelease: prerelease || undefined },
  };
}

/** 格式化版本字符串 */
export function formatVersion(v: SkillVersion): string {
  const base = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease) {
    return `${base}-${v.prerelease}`;
  }
  return base;
}

/** 比较两个版本：返回 -1 (a < b) / 0 (a == b) / 1 (a > b) */
export function compareVersions(a: SkillVersion, b: SkillVersion): number {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;

  // 预发布版本低于正式版本
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  if (a.prerelease && b.prerelease) {
    return a.prerelease < b.prerelease ? -1 : a.prerelease > b.prerelease ? 1 : 0;
  }
  return 0;
}

/** 全局默认实例 */
export const skillVersionRegistry = new SkillVersionRegistry();

/** 便利函数：从 SkillEntry 创建 VersionedSkillEntry 并注册 */
export function registerSkillWithVersion(
  registry: SkillVersionRegistry,
  entry: SkillEntry,
  version: string,
): { success: boolean; error?: string } {
  return registry.register(entry.skill.name, version, entry);
}

/** 默认版本别名 */
export const DEFAULT_ALIASES = ['latest', 'stable', 'experimental'] as const;

/** 自动设置默认别名 */
export function setDefaultAliases(
  registry: SkillVersionRegistry,
  name: string,
  version: string,
  alias: 'latest' | 'stable' | 'experimental',
): { success: boolean; error?: string } {
  return registry.setAlias(name, alias, version);
}
