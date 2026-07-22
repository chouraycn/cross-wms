/**
 * Plugin Version Manager — 插件版本管理器
 *
 * 管理插件版本更新、回滚、版本检查。
 * 与 ./update.ts 互补：
 * - update.ts 关注 OpenClaw 运行时的更新检查
 * - 本文件提供 SDK 层的版本管理接口
 */

import { logger } from '../../logger.js';
import type { PluginManifest } from './types.js';
import {
  parseVersion,
  compareVersions,
  satisfiesVersion,
} from './loader.js';
import { comparePluginVersions } from './contract.js';

/** 版本信息 */
export interface PluginVersionInfo {
  /** 插件 ID */
  pluginId: string;
  /** 当前版本 */
  currentVersion: string;
  /** 最新版本（如已知） */
  latestVersion?: string;
  /** 安装时间 */
  installedAt?: number;
  /** 更新时间 */
  updatedAt?: number;
  /** 版本历史 */
  history?: VersionHistoryEntry[];
}

/** 版本历史条目 */
export interface VersionHistoryEntry {
  /** 版本号 */
  version: string;
  /** 安装时间 */
  installedAt: number;
  /** 操作类型 */
  action: 'install' | 'update' | 'rollback';
  /** 前一版本（更新/回滚时） */
  previousVersion?: string;
}

/** 版本更新检查结果 */
export interface VersionUpdateCheck {
  /** 是否有更新 */
  hasUpdate: boolean;
  /** 当前版本 */
  currentVersion: string;
  /** 最新版本 */
  latestVersion?: string;
  /** 更新类型 */
  updateType?: 'patch' | 'minor' | 'major' | 'prerelease';
  /** 版本范围（如指定） */
  versionRange?: string;
}

/** 版本管理选项 */
export interface VersionManagerOptions {
  /** 允许降级 */
  allowDowngrade?: boolean;
  /** 允许预发布版本 */
  allowPrerelease?: boolean;
  /** 版本范围约束 */
  versionRange?: string;
}

// ===================== 版本注册表 =====================

class PluginVersionRegistry {
  private versions = new Map<string, PluginVersionInfo>();
  private options: VersionManagerOptions = {
    allowDowngrade: false,
    allowPrerelease: false,
  };

  /** 配置版本管理器 */
  configure(options: Partial<VersionManagerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /** 注册插件版本 */
  register(pluginId: string, version: string, action: 'install' | 'update' | 'rollback' = 'install', previousVersion?: string): void {
    const now = Date.now();
    const existing = this.versions.get(pluginId);
    const history = existing?.history ?? [];

    if (existing) {
      history.push({
        version,
        installedAt: now,
        action,
        ...(previousVersion !== undefined ? { previousVersion } : {}),
      });
    }

    const info: PluginVersionInfo = {
      pluginId,
      currentVersion: version,
      ...(existing?.latestVersion !== undefined ? { latestVersion: existing.latestVersion } : {}),
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
      history,
    };
    this.versions.set(pluginId, info);
    logger.debug(`[VersionManager] 注册 ${pluginId}@${version} (${action})`);
  }

  /** 注销插件版本 */
  unregister(pluginId: string): boolean {
    return this.versions.delete(pluginId);
  }

  /** 获取版本信息 */
  getVersionInfo(pluginId: string): PluginVersionInfo | undefined {
    return this.versions.get(pluginId);
  }

  /** 获取当前版本 */
  getCurrentVersion(pluginId: string): string | undefined {
    return this.versions.get(pluginId)?.currentVersion;
  }

  /** 设置最新版本（从远程检查得到） */
  setLatestVersion(pluginId: string, latestVersion: string): void {
    const info = this.versions.get(pluginId);
    if (info) {
      info.latestVersion = latestVersion;
    }
  }

  /** 检查更新 */
  checkUpdate(pluginId: string): VersionUpdateCheck {
    const info = this.versions.get(pluginId);
    if (!info) {
      return { hasUpdate: false, currentVersion: 'unknown' };
    }
    if (!info.latestVersion) {
      return { hasUpdate: false, currentVersion: info.currentVersion };
    }

    const cmp = comparePluginVersions(info.currentVersion, info.latestVersion);
    const hasUpdate = cmp === 'upgrade';

    let updateType: 'patch' | 'minor' | 'major' | 'prerelease' | undefined;
    if (hasUpdate) {
      const current = parseVersion(info.currentVersion);
      const latest = parseVersion(info.latestVersion);
      if (latest.prerelease && !current.prerelease) {
        updateType = 'prerelease';
      } else if (latest.major > current.major) {
        updateType = 'major';
      } else if (latest.minor > current.minor) {
        updateType = 'minor';
      } else {
        updateType = 'patch';
      }
    }

    return {
      hasUpdate,
      currentVersion: info.currentVersion,
      latestVersion: info.latestVersion,
      ...(updateType !== undefined ? { updateType } : {}),
      ...(this.options.versionRange !== undefined ? { versionRange: this.options.versionRange } : {}),
    };
  }

  /** 验证版本迁移 */
  validateMigration(pluginId: string, targetVersion: string): { ok: boolean; reason?: string } {
    const info = this.versions.get(pluginId);
    if (!info) {
      return { ok: true };
    }

    // 检查版本范围约束
    if (this.options.versionRange && !satisfiesVersion(targetVersion, this.options.versionRange)) {
      return { ok: false, reason: `版本 ${targetVersion} 不在范围 ${this.options.versionRange} 内` };
    }

    // 检查预发布版本
    const target = parseVersion(targetVersion);
    if (target.prerelease && !this.options.allowPrerelease) {
      return { ok: false, reason: `不允许预发布版本: ${targetVersion}` };
    }

    // 检查降级
    const cmp = comparePluginVersions(info.currentVersion, targetVersion);
    if (cmp === 'downgrade' && !this.options.allowDowngrade) {
      return { ok: false, reason: `不允许降级: ${info.currentVersion} → ${targetVersion}` };
    }

    return { ok: true };
  }

  /** 执行版本迁移 */
  migrate(pluginId: string, targetVersion: string): { ok: boolean; previousVersion?: string; error?: string } {
    const validation = this.validateMigration(pluginId, targetVersion);
    if (!validation.ok) {
      return { ok: false, ...(validation.reason !== undefined ? { error: validation.reason } : {}) };
    }

    const info = this.versions.get(pluginId);
    const previousVersion = info?.currentVersion;
    const action = previousVersion ? 'update' : 'install';

    this.register(pluginId, targetVersion, action, previousVersion);
    return {
      ok: true,
      ...(previousVersion !== undefined ? { previousVersion } : {}),
    };
  }

  /** 回滚到指定版本 */
  rollback(pluginId: string, targetVersion: string): { ok: boolean; previousVersion?: string; error?: string } {
    const info = this.versions.get(pluginId);
    if (!info) {
      return { ok: false, error: `插件 ${pluginId} 未注册` };
    }

    // 检查目标版本是否在历史中
    if (info.history && !info.history.some((h) => h.version === targetVersion)) {
      return { ok: false, error: `版本 ${targetVersion} 不在历史记录中` };
    }

    const previousVersion = info.currentVersion;
    this.register(pluginId, targetVersion, 'rollback', previousVersion);
    logger.info(`[VersionManager] 回滚 ${pluginId}: ${previousVersion} → ${targetVersion}`);
    return { ok: true, previousVersion };
  }

  /** 列出所有版本信息 */
  list(): PluginVersionInfo[] {
    return Array.from(this.versions.values());
  }

  /** 获取版本历史 */
  getHistory(pluginId: string): VersionHistoryEntry[] {
    return this.versions.get(pluginId)?.history ?? [];
  }

  /** 清空 */
  clear(): void {
    this.versions.clear();
  }
}

/** 全局版本管理器 */
const pluginVersionRegistry = new PluginVersionRegistry();

/** 获取版本管理器 */
export function getPluginVersionRegistry(): PluginVersionRegistry {
  return pluginVersionRegistry;
}

// ===================== 工具函数 =====================

/** 比较版本号 */
export function compareVersionsAsString(a: string, b: string): number {
  return compareVersions(parseVersion(a), parseVersion(b));
}

/** 检查版本是否兼容 */
export function isVersionCompatible(version: string, range: string): boolean {
  return satisfiesVersion(version, range);
}

/** 格式化版本信息 */
export function formatVersionInfo(info: PluginVersionInfo): string {
  const lines: string[] = [
    `Plugin: ${info.pluginId}`,
    `  Current: ${info.currentVersion}`,
    ...(info.latestVersion !== undefined ? [`  Latest: ${info.latestVersion}`] : []),
    ...(info.installedAt !== undefined ? [`  Installed: ${new Date(info.installedAt).toISOString()}`] : []),
    ...(info.updatedAt !== undefined ? [`  Updated: ${new Date(info.updatedAt).toISOString()}`] : []),
  ];
  if (info.history && info.history.length > 0) {
    lines.push('  History:');
    for (const entry of info.history) {
      lines.push(`    ${entry.version} (${entry.action}) @ ${new Date(entry.installedAt).toISOString()}`);
    }
  }
  return lines.join('\n');
}

/** 从 manifest 注册版本 */
export function registerVersionFromManifest(manifest: PluginManifest): void {
  pluginVersionRegistry.register(manifest.id, manifest.version, 'install');
}
