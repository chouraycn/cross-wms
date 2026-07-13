/**
 * Skill Version Compatibility — 技能版本兼容性检查与升级策略
 *
 * 提供语义化版本(SemVer)解析、版本范围匹配和兼容性检测：
 * 1. 版本解析 — 解析 major.minor.patch 格式
 * 2. 版本比较 — compare, greaterThan, lessThan, satisfies
 * 3. 范围匹配 — ^ ~ >= <= * 等范围语法
 * 4. 兼容性检测 — 检测破坏性变更
 * 5. 升级策略 — 安全升级、强制升级、警告升级
 *
 * 支持的范围语法：
 * - ^1.2.3 → 1.2.3 - 2.0.0 (不包括 2.0.0)
 * - ~1.2.3 → 1.2.3 - 1.3.0 (不包括 1.3.0)
 * - >=1.2.3 → 大于等于 1.2.3
 * - <=1.2.3 → 小于等于 1.2.3
 * - 1.2.x  → 1.2.* (1.2.0 - 1.3.0)
 * - *      → 任意版本
 */

// ===================== 类型定义 =====================

/** 解析后的版本 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
  original: string;
}

/** 版本范围类型 */
export type RangeOperator = '^' | '~' | '>=' | '<=' | '>' | '<' | '=' | '*' | '';

/** 解析后的版本范围 */
export interface VersionRange {
  operator: RangeOperator;
  version: ParsedVersion;
  original: string;
}

/** 兼容性检查结果 */
export interface CompatibilityResult {
  compatible: boolean;
  level: 'none' | 'patch' | 'minor' | 'major';
  current: string;
  target: string;
  message: string;
  breakingChanges?: string[];
  warnings?: string[];
}

/** 升级策略 */
export type UpgradeStrategy = 'safe' | 'warning' | 'force';

/** 升级检查结果 */
export interface UpgradeCheckResult {
  canUpgrade: boolean;
  strategy: UpgradeStrategy;
  fromVersion: string;
  toVersion: string;
  level: 'patch' | 'minor' | 'major';
  message: string;
  requiresMigration: boolean;
  migrationHints?: string[];
}

// ===================== 版本解析 =====================

/**
 * 解析版本字符串
 *
 * 支持格式：
 * - "1.2.3"
 * - "1.2.3-beta.1"
 * - "1.2.3+build.123"
 * - "v1.2.3"
 */
export function parseVersion(version: string): ParsedVersion | null {
  if (!version || typeof version !== 'string') return null;

  const cleaned = version.trim().replace(/^v/i, '');
  const regex = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-.]+))?(?:\+([0-9A-Za-z-.]+))?$/;
  const match = cleaned.match(regex);

  if (!match) return null;

  const [, major, minor, patch, prerelease, build] = match;

  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: parseInt(patch, 10),
    prerelease: prerelease || undefined,
    build: build || undefined,
    original: version,
  };
}

/**
 * 版本号转字符串
 */
export function versionToString(v: ParsedVersion): string {
  let result = `${v.major}.${v.minor}.${v.patch}`;
  if (v.prerelease) result += `-${v.prerelease}`;
  if (v.build) result += `+${v.build}`;
  return result;
}

// ===================== 版本比较 =====================

/**
 * 比较两个版本
 *
 * 返回值：
 * - 正数：a > b
 * - 负数：a < b
 * - 0：a == b
 */
export function compareVersions(a: string | ParsedVersion, b: string | ParsedVersion): number {
  const va = typeof a === 'string' ? parseVersion(a) : a;
  const vb = typeof b === 'string' ? parseVersion(b) : b;

  if (!va || !vb) {
    throw new Error('Invalid version string');
  }

  // 比较 major.minor.patch
  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;

  // 比较预发布版本
  // 有预发布版本 < 没有预发布版本
  if (va.prerelease && !vb.prerelease) return -1;
  if (!va.prerelease && vb.prerelease) return 1;

  if (va.prerelease && vb.prerelease) {
    return comparePrerelease(va.prerelease, vb.prerelease);
  }

  return 0;
}

/**
 * 比较预发布版本
 */
function comparePrerelease(a: string, b: string): number {
  const aParts = a.split('.');
  const bParts = b.split('.');

  const len = Math.min(aParts.length, bParts.length);
  for (let i = 0; i < len; i++) {
    const aPart = aParts[i];
    const bPart = bParts[i];

    const aNum = parseInt(aPart, 10);
    const bNum = parseInt(bPart, 10);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      // 字符串比较
      const cmp = aPart.localeCompare(bPart);
      if (cmp !== 0) return cmp;
    }
  }

  return aParts.length - bParts.length;
}

// ===================== 范围解析与匹配 =====================

/**
 * 解析版本范围字符串
 *
 * 支持：^1.2.3, ~1.2.3, >=1.2.3, <=1.2.3, 1.2.x, *
 */
export function parseRange(rangeStr: string): VersionRange | null {
  if (!rangeStr || rangeStr === '*' || rangeStr === 'x' || rangeStr === 'X') {
    return {
      operator: '*',
      version: { major: 0, minor: 0, patch: 0, original: '0.0.0' },
      original: rangeStr,
    };
  }

  const trimmed = rangeStr.trim();

  // 匹配操作符
  const operatorMatch = trimmed.match(/^(\^|~|>=|<=|>|<|=)?(.+)$/);
  if (!operatorMatch) return null;

  const [, op = '', verStr] = operatorMatch;
  const version = parseVersion(verStr.replace(/\.x$/i, '.0'));
  if (!version) return null;

  return {
    operator: op as RangeOperator,
    version,
    original: rangeStr,
  };
}

/**
 * 检查版本是否满足范围
 */
export function satisfiesRange(version: string | ParsedVersion, range: string | VersionRange): boolean {
  const v = typeof version === 'string' ? parseVersion(version) : version;
  const r = typeof range === 'string' ? parseRange(range) : range;

  if (!v || !r) return false;

  switch (r.operator) {
    case '*':
      return true;
    case '':
    case '=':
      return compareVersions(v, r.version) === 0;
    case '>':
      return compareVersions(v, r.version) > 0;
    case '>=':
      return compareVersions(v, r.version) >= 0;
    case '<':
      return compareVersions(v, r.version) < 0;
    case '<=':
      return compareVersions(v, r.version) <= 0;
    case '^':
      // ^1.2.3 → >=1.2.3 <2.0.0
      // ^0.2.3 → >=0.2.3 <0.3.0
      // ^0.0.3 → >=0.0.3 <0.0.4
      return satisfiesCaret(v, r.version);
    case '~':
      // ~1.2.3 → >=1.2.3 <1.3.0
      return satisfiesTilde(v, r.version);
    default:
      return false;
  }
}

/**
 * caret (^) 范围匹配
 */
function satisfiesCaret(version: ParsedVersion, range: ParsedVersion): boolean {
  if (compareVersions(version, range) < 0) return false;

  if (range.major > 0) {
    // ^1.2.3 → < 2.0.0
    return version.major === range.major;
  } else if (range.minor > 0) {
    // ^0.2.3 → < 0.3.0
    return version.major === 0 && version.minor === range.minor;
  } else {
    // ^0.0.3 → < 0.0.4
    return version.major === 0 && version.minor === 0 && version.patch === range.patch;
  }
}

/**
 * tilde (~) 范围匹配
 */
function satisfiesTilde(version: ParsedVersion, range: ParsedVersion): boolean {
  if (compareVersions(version, range) < 0) return false;
  return version.major === range.major && version.minor === range.minor;
}

// ===================== 兼容性检测 =====================

/**
 * 检查两个版本的兼容性
 *
 * 返回：
 * - 'none'  版本相同
 * - 'patch' 补丁版本升级（向后兼容）
 * - 'minor' 次版本升级（向后兼容）
 * - 'major' 主版本升级（可能不兼容）
 */
export function checkCompatibility(
  currentVersion: string,
  targetVersion: string,
): CompatibilityResult {
  const current = parseVersion(currentVersion);
  const target = parseVersion(targetVersion);

  if (!current || !target) {
    return {
      compatible: false,
      level: 'major',
      current: currentVersion,
      target: targetVersion,
      message: '无法解析版本号',
    };
  }

  const cmp = compareVersions(current, target);

  if (cmp === 0) {
    return {
      compatible: true,
      level: 'none',
      current: currentVersion,
      target: targetVersion,
      message: '版本相同，无需升级',
    };
  }

  if (cmp > 0) {
    return {
      compatible: true,
      level: 'none',
      current: currentVersion,
      target: targetVersion,
      message: '当前版本已高于目标版本',
    };
  }

  // 版本升级
  const breakingChanges: string[] = [];
  const warnings: string[] = [];

  let level: 'patch' | 'minor' | 'major';
  let compatible: boolean;

  if (target.major !== current.major) {
    level = 'major';
    compatible = false;
    breakingChanges.push(`主版本升级：${current.major}.x.x → ${target.major}.x.x，可能存在破坏性变更`);
  } else if (target.minor !== current.minor) {
    level = 'minor';
    compatible = true;
    warnings.push(`次版本升级：新增功能，理论上向后兼容`);
  } else {
    level = 'patch';
    compatible = true;
  }

  const messages: Record<string, string> = {
    patch: `补丁版本升级 ${currentVersion} → ${targetVersion}，修复 Bug，完全兼容`,
    minor: `次版本升级 ${currentVersion} → ${targetVersion}，新增功能，向后兼容`,
    major: `主版本升级 ${currentVersion} → ${targetVersion}，可能包含破坏性变更`,
  };

  return {
    compatible,
    level,
    current: currentVersion,
    target: targetVersion,
    message: messages[level],
    breakingChanges: breakingChanges.length > 0 ? breakingChanges : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ===================== 升级策略 =====================

/**
 * 检查升级策略
 *
 * 根据版本差异决定升级策略：
 * - safe:    补丁升级，可以自动安全升级
 * - warning: 次版本升级，建议升级但需要确认
 * - force:   主版本升级，需要用户确认，可能需要迁移
 */
export function checkUpgradeStrategy(
  currentVersion: string,
  targetVersion: string,
): UpgradeCheckResult {
  const compat = checkCompatibility(currentVersion, targetVersion);

  if (compat.level === 'none') {
    return {
      canUpgrade: false,
      strategy: 'safe' as const,
      fromVersion: currentVersion,
      toVersion: targetVersion,
      level: 'patch' as const,
      message: '版本相同，无需升级',
      requiresMigration: false,
    };
  }

  let strategy: UpgradeStrategy;
  let requiresMigration = false;
  const migrationHints: string[] = [];

  switch (compat.level) {
    case 'patch':
      strategy = 'safe';
      break;
    case 'minor':
      strategy = 'warning';
      break;
    case 'major':
      strategy = 'force';
      requiresMigration = true;
      migrationHints.push('请阅读升级指南，了解破坏性变更详情');
      migrationHints.push('建议先在测试环境验证升级');
      migrationHints.push('升级前务必备份数据');
      break;
  }

  const strategyMessages: Record<UpgradeStrategy, string> = {
    safe: `安全升级 ${currentVersion} → ${targetVersion}，补丁修复，可自动升级`,
    warning: `功能升级 ${currentVersion} → ${targetVersion}，新增功能，建议确认后升级`,
    force: `重大升级 ${currentVersion} → ${targetVersion}，存在破坏性变更，需要手动确认`,
  };

  return {
    canUpgrade: true,
    strategy,
    fromVersion: currentVersion,
    toVersion: targetVersion,
    level: compat.level,
    message: strategyMessages[strategy],
    requiresMigration,
    migrationHints: migrationHints.length > 0 ? migrationHints : undefined,
  };
}

// ===================== 便捷函数 =====================

/** 是否大于 */
export function gt(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

/** 是否小于 */
export function lt(a: string, b: string): boolean {
  return compareVersions(a, b) < 0;
}

/** 是否大于等于 */
export function gte(a: string, b: string): boolean {
  return compareVersions(a, b) >= 0;
}

/** 是否小于等于 */
export function lte(a: string, b: string): boolean {
  return compareVersions(a, b) <= 0;
}

/** 是否相等 */
export function eq(a: string, b: string): boolean {
  return compareVersions(a, b) === 0;
}

/**
 * 获取版本范围中的最大值
 *
 * @param versions - 版本列表
 * @param range - 版本范围
 * @returns 满足范围的最高版本，未找到返回 null
 */
export function maxSatisfying(versions: string[], range: string): string | null {
  const satisfying = versions
    .filter((v) => satisfiesRange(v, range))
    .sort(compareVersions);

  return satisfying.length > 0 ? satisfying[satisfying.length - 1] : null;
}