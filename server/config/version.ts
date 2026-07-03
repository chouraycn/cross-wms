// 配置版本号管理与兼容性检查
// 参考 openclaw/src/config/version.ts 的设计，提供配置版本号解析、比较与兼容性判断

import { logger } from '../logger.js';

// 当前配置 schema 版本号（与 package.json 的版本解耦，独立演进）
export const CONFIG_VERSION = '1.0.0';

// 已知遗留配置版本号（早于此版本视为遗留配置，需要迁移）
export const LEGACY_CONFIG_VERSION = '0.9.0';

// 兼容性窗口：当前主版本号向下兼容的主版本范围
const COMPATIBLE_MAJOR_FLOOR = 1;

// 版本号正则：支持 v 前缀、major.minor.patch 与可选 prerelease 后缀
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

// 解析后的配置版本号结构
export interface ParsedConfigVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[] | null;
  raw: string;
}

// 将原始版本字符串解析为结构化版本号，无法解析时返回 null
export function parseConfigVersion(raw: string | null | undefined): ParsedConfigVersion | null {
  if (!raw || typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(VERSION_RE);
  if (!match) {
    return null;
  }
  const [, major, minor, patch, suffix] = match;
  return {
    major: Number.parseInt(major, 10),
    minor: Number.parseInt(minor, 10),
    patch: Number.parseInt(patch, 10),
    prerelease: suffix ? suffix.split('.').filter(Boolean) : null,
    raw: trimmed,
  };
}

// 比较两个版本号：a < b 返回 -1，a > b 返回 1，相等返回 0，无法解析返回 null
export function compareConfigVersions(
  a: string | null | undefined,
  b: string | null | undefined,
): number | null {
  const parsedA = parseConfigVersion(a);
  const parsedB = parseConfigVersion(b);
  if (!parsedA || !parsedB) {
    return null;
  }
  if (parsedA.major !== parsedB.major) {
    return parsedA.major < parsedB.major ? -1 : 1;
  }
  if (parsedA.minor !== parsedB.minor) {
    return parsedA.minor < parsedB.minor ? -1 : 1;
  }
  if (parsedA.patch !== parsedB.patch) {
    return parsedA.patch < parsedB.patch ? -1 : 1;
  }
  // 稳定版本（无 prerelease）大于预发布版本
  const rankA = parsedA.prerelease?.length ? 0 : 1;
  const rankB = parsedB.prerelease?.length ? 0 : 1;
  if (rankA !== rankB) {
    return rankA < rankB ? -1 : 1;
  }
  if (parsedA.prerelease || parsedB.prerelease) {
    return comparePrereleaseIdentifiers(parsedA.prerelease, parsedB.prerelease);
  }
  return 0;
}

// 预发布标识符比较：数字按数值比较，字符串按字典序，数字小于字符串
function comparePrereleaseIdentifiers(
  a: string[] | null,
  b: string[] | null,
): number {
  const listA = a ?? [];
  const listB = b ?? [];
  const max = Math.max(listA.length, listB.length);
  for (let i = 0; i < max; i++) {
    const itemA = listA[i];
    const itemB = listB[i];
    if (itemA === undefined) {
      return -1;
    }
    if (itemB === undefined) {
      return 1;
    }
    const numA = Number(itemA);
    const numB = Number(itemB);
    const aIsNum = !Number.isNaN(numA);
    const bIsNum = !Number.isNaN(numB);
    if (aIsNum && bIsNum) {
      if (numA !== numB) {
        return numA < numB ? -1 : 1;
      }
      continue;
    }
    if (aIsNum !== bIsNum) {
      return aIsNum ? -1 : 1;
    }
    if (itemA !== itemB) {
      return itemA < itemB ? -1 : 1;
    }
  }
  return 0;
}

// 判断给定版本号是否与当前 CONFIG_VERSION 兼容
// 兼容规则：主版本号一致且不低于兼容性下限，且版本号不高于当前版本
export function isConfigVersionCompatible(
  version: string | null | undefined,
  currentVersion: string = CONFIG_VERSION,
): boolean {
  const parsed = parseConfigVersion(version);
  const parsedCurrent = parseConfigVersion(currentVersion);
  if (!parsed || !parsedCurrent) {
    return false;
  }
  if (parsed.major < COMPATIBLE_MAJOR_FLOOR) {
    return false;
  }
  if (parsed.major !== parsedCurrent.major) {
    return false;
  }
  const cmp = compareConfigVersions(version, currentVersion);
  if (cmp === null) {
    return false;
  }
  return cmp <= 0;
}

// 判断给定版本号是否为遗留版本（低于 LEGACY_CONFIG_VERSION）
export function isLegacyConfigVersion(version: string | null | undefined): boolean {
  const cmp = compareConfigVersions(version, LEGACY_CONFIG_VERSION);
  return cmp !== null && cmp < 0;
}

// 版本号递增：根据指定级别（patch/minor/major）提升当前版本号
export function bumpConfigVersion(
  current: string = CONFIG_VERSION,
  level: 'patch' | 'minor' | 'major' = 'patch',
): string {
  const parsed = parseConfigVersion(current);
  if (!parsed) {
    logger.warn(`[config] 无法解析当前版本号 "${current}"，bump 失败，返回原值`);
    return current;
  }
  if (level === 'major') {
    return `${parsed.major + 1}.0.0`;
  }
  if (level === 'minor') {
    return `${parsed.major}.${parsed.minor + 1}.0`;
  }
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

// 判断运行时版本是否比 lastTouched 版本更新（用于版本漂移告警）
export function shouldWarnOnTouchedVersion(
  current: string | null | undefined,
  touched: string | null | undefined,
): boolean {
  const cmp = compareConfigVersions(current, touched);
  if (cmp === null) {
    return false;
  }
  return cmp < 0;
}
