/**
 * Skill Version Tracker — Skill 版本检测与变更追踪
 *
 * 负责 Skill 的版本管理、变更检测和热重载触发：
 * 1. promptVersion — 基于 SKILL.md 内容生成的版本哈希
 * 2. 变更检测 — 检测文件变更并触发重载
 * 3. 版本历史 — 记录版本变更记录
 *
 * 当 SKILL.md 内容变化时，promptVersion 会更新，
 * 上层系统可以据此判断是否需要更新缓存或重新注入 Prompt。
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import { skillRegistry } from './skillRegistry.js';
import { rebuildSkillIndex } from './skillDiscoverySingleton.js';
import { skillSnapshotManager } from './skillSnapshot.js';
import type {
  RegisteredSkill,
} from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** Skill 版本信息 */
export interface SkillVersionInfo {
  skillId: string;
  currentVersion: string;
  previousVersion?: string;
  lastCheckedAt: number;
  lastModifiedAt?: number;
  contentHash: string;
  changeHistory: VersionChangeRecord[];
}

/** 版本变更记录 */
export interface VersionChangeRecord {
  fromVersion?: string;
  toVersion: string;
  changedAt: number;
  changeType: 'created' | 'updated' | 'reloaded';
  summary?: string;
}

/** 版本检查结果 */
export interface VersionCheckResult {
  skillId: string;
  changed: boolean;
  currentVersion: string;
  previousVersion?: string;
  changeType?: 'created' | 'updated';
}

/** 批量检查结果 */
export interface BatchVersionCheckResult {
  total: number;
  changed: number;
  unchanged: number;
  results: VersionCheckResult[];
}

// ===================== 常量 =====================

/** 默认检查间隔（毫秒） */
const DEFAULT_CHECK_INTERVAL = 30_000; // 30秒

/** 最大历史记录数 */
const MAX_HISTORY = 10;

// ===================== SkillVersionTracker 类 =====================

/**
 * Skill 版本追踪器
 */
export class SkillVersionTracker {
  /** 版本信息：skillId → SkillVersionInfo */
  private versions = new Map<string, SkillVersionInfo>();

  /** 最后检查时间 */
  private lastCheckAt = 0;

  /** 检查间隔 */
  private checkInterval: number;

  /** 自动检查定时器 */
  private autoCheckTimer: NodeJS.Timeout | null = null;

  constructor(options?: { checkInterval?: number }) {
    this.checkInterval = options?.checkInterval ?? DEFAULT_CHECK_INTERVAL;
  }

  // ===================== 1. 初始化 =====================

  /**
   * 初始化版本追踪器
   *
   * 从当前注册表中的所有 Skill 生成初始版本信息。
   */
  init(): void {
    const skills = skillRegistry.getAllSkills();

    for (const skill of skills) {
      this.trackSkill(skill);
    }

    this.lastCheckAt = Date.now();
    logger.info(`[SkillVersionTracker] Initialized. Tracked: ${this.versions.size}`);
  }

  /**
   * 开始自动检查
   *
   * 定时检查 Skill 文件变更，自动触发热重载。
   */
  startAutoCheck(): void {
    if (this.autoCheckTimer) {
      logger.warn('[SkillVersionTracker] Auto check already running.');
      return;
    }

    this.autoCheckTimer = setInterval(() => {
      this.checkAllVersions().catch((e) => {
        logger.error('[SkillVersionTracker] Auto check error:', e);
      });
    }, this.checkInterval);

    logger.info(`[SkillVersionTracker] Auto check started (interval: ${this.checkInterval}ms)`);
  }

  /**
   * 停止自动检查
   */
  stopAutoCheck(): void {
    if (this.autoCheckTimer) {
      clearInterval(this.autoCheckTimer);
      this.autoCheckTimer = null;
      logger.info('[SkillVersionTracker] Auto check stopped.');
    }
  }

  // ===================== 2. 版本追踪 =====================

  /**
   * 开始追踪单个 Skill
   *
   * @param skill - 注册的 Skill
   */
  trackSkill(skill: RegisteredSkill): void {
    const { definition } = skill;
    const contentHash = this.generateContentHash(definition.skillMdContent || '');

    const info: SkillVersionInfo = {
      skillId: definition.id,
      currentVersion: contentHash,
      lastCheckedAt: Date.now(),
      lastModifiedAt: definition.sourcePath
        ? this.getFileMtime(definition.sourcePath)
        : undefined,
      contentHash,
      changeHistory: [
        {
          toVersion: contentHash,
          changedAt: Date.now(),
          changeType: 'created',
        },
      ],
    };

    this.versions.set(definition.id, info);
    skillSnapshotManager.bumpVersion('manual', definition.sourcePath);
  }

  /**
   * 停止追踪 Skill
   *
   * @param skillId - Skill ID
   */
  untrackSkill(skillId: string): void {
    this.versions.delete(skillId);
    skillSnapshotManager.bumpVersion('manual');
  }

  // ===================== 3. 版本检查 =====================

  /**
   * 检查单个 Skill 的版本
   *
   * @param skillId - Skill ID
   * @param autoReload - 是否自动重载变更的 Skill
   * @returns 检查结果
   */
  async checkVersion(skillId: string, autoReload = true): Promise<VersionCheckResult> {
    const info = this.versions.get(skillId);
    if (!info) {
      return {
        skillId,
        changed: false,
        currentVersion: '',
      };
    }

    const skill = skillRegistry.getSkill(skillId);
    if (!skill) {
      return {
        skillId,
        changed: false,
        currentVersion: info.currentVersion,
      };
    }

    const { definition } = skill;
    const newHash = this.generateContentHash(definition.skillMdContent || '');
    const changed = newHash !== info.contentHash;

    info.lastCheckedAt = Date.now();

    if (!changed) {
      return {
        skillId,
        changed: false,
        currentVersion: info.currentVersion,
      };
    }

    // 版本变更
    const previousVersion = info.currentVersion;
    info.previousVersion = previousVersion;
    info.currentVersion = newHash;
    info.contentHash = newHash;
    info.lastModifiedAt = definition.sourcePath
      ? this.getFileMtime(definition.sourcePath)
      : undefined;

    // 记录历史
    info.changeHistory.unshift({
      fromVersion: previousVersion,
      toVersion: newHash,
      changedAt: Date.now(),
      changeType: 'updated',
    });

    // 限制历史记录数
    if (info.changeHistory.length > MAX_HISTORY) {
      info.changeHistory.length = MAX_HISTORY;
    }

    // 自动重载
    if (autoReload) {
      try {
        await skillRegistry.reloadSkill(skillId);
        rebuildSkillIndex();
        skillSnapshotManager.bumpVersion('watch', skill.definition.sourcePath);
        logger.info(`[SkillVersionTracker] Skill '${skillId}' auto-reloaded and snapshot bumped.`);
      } catch (e) {
        logger.error(`[SkillVersionTracker] Auto-reload failed for '${skillId}':`, e);
      }
    }

    return {
      skillId,
      changed: true,
      currentVersion: newHash,
      previousVersion,
      changeType: 'updated',
    };
  }

  /**
   * 检查所有 Skill 的版本
   *
   * @param autoReload - 是否自动重载变更的 Skill
   * @returns 批量检查结果
   */
  async checkAllVersions(autoReload = true): Promise<BatchVersionCheckResult> {
    const results: VersionCheckResult[] = [];
    let changed = 0;
    let unchanged = 0;

    for (const skillId of this.versions.keys()) {
      const result = await this.checkVersion(skillId, autoReload);
      results.push(result);

      if (result.changed) {
        changed++;
      } else {
        unchanged++;
      }
    }

    this.lastCheckAt = Date.now();

    if (changed > 0) {
      logger.info(`[SkillVersionTracker] Check complete. Changed: ${changed}, Unchanged: ${unchanged}`);
    }

    return {
      total: results.length,
      changed,
      unchanged,
      results,
    };
  }

  // ===================== 4. 查询接口 =====================

  /**
   * 获取 Skill 版本信息
   *
   * @param skillId - Skill ID
   * @returns 版本信息或 undefined
   */
  getVersionInfo(skillId: string): SkillVersionInfo | undefined {
    return this.versions.get(skillId);
  }

  /**
   * 获取所有 Skill 的当前版本
   *
   * @returns skillId → version 映射
   */
  getAllVersions(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [id, info] of this.versions.entries()) {
      result[id] = info.currentVersion;
    }
    return result;
  }

  /**
   * 生成 Skill 集合的总体版本签名
   *
   * 用于判断整个 Skill 系统是否有变更。
   *
   * @returns 版本签名（哈希值）
   */
  getCollectiveSignature(): string {
    const versions = this.getAllVersions();
    const sorted = Object.entries(versions)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, ver]) => `${id}:${ver}`)
      .join('|');
    const contentHash = this.generateContentHash(sorted);
    // 将快照版本号纳入总体签名
    return `v${skillSnapshotManager.getGlobalVersion()}:${contentHash}`;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    total: number;
    lastCheckAt: number;
    checkInterval: number;
    autoCheckRunning: boolean;
  } {
    return {
      total: this.versions.size,
      lastCheckAt: this.lastCheckAt,
      checkInterval: this.checkInterval,
      autoCheckRunning: this.autoCheckTimer !== null,
    };
  }

  /**
   * 获取 Skill 的 promptVersion（OpenClaw 兼容格式：sha256:<hash>）
   *
   * @param skillId - Skill ID
   * @returns promptVersion 字符串，格式：sha256:<16位hash>
   */
  getPromptVersion(skillId: string): string | undefined {
    const info = this.versions.get(skillId);
    if (!info) return undefined;
    return `sha256:${info.contentHash}`;
  }

  // ===================== 5. 辅助方法 =====================

  /**
   * 生成内容哈希（作为 promptVersion）
   *
   * 使用 SHA-256 哈希，取前 16 位作为版本标识。
   *
   * @param content - 内容字符串
   * @returns 版本哈希
   */
  generateContentHash(content: string): string {
    if (!content) {
      return '0'.repeat(16);
    }
    return crypto
      .createHash('sha256')
      .update(content)
      .digest('hex')
      .slice(0, 16);
  }

  /**
   * 获取文件修改时间
   */
  private getFileMtime(sourcePath: string): number | undefined {
    try {
      const skillMdPath = path.join(sourcePath, 'SKILL.md');
      const stat = fs.statSync(skillMdPath);
      return stat.mtimeMs;
    } catch {
      return undefined;
    }
  }
}

// ===================== Module-level Singleton =====================

/** Skill 版本追踪器单例 */
export const skillVersionTracker = new SkillVersionTracker();
