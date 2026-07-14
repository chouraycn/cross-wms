/**
 * Skill Watcher Service
 * chokidar 监听技能目录下 SKILL.md 变化，通过 SSE 广播给前端
 *
 * 增强功能：
 * - 空闲 TTL 自动清理（60 分钟无活动且无客户端时关闭 watcher）
 * - 多目录共享 watcher（refCount 引用计数）
 * - 写入稳定性检查（文件大小稳定后再触发）
 * - 增强忽略规则（.git, node_modules, dist, .venv, __pycache__ 等）
 */

import crypto from 'crypto';
import chokidar from 'chokidar';
import type { Response } from 'express';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { scanWorkbuddySkills } from '../routes/skills.js';
import { auditSkillMd, generateMarkdownReport } from './securityAuditor.js';
import { createSkillAudit, getLatestSkillAudit } from '../dao/chains.js';
import { logger } from '../logger.js';
import { AppPaths } from '../config/appPaths.js';

// ===================== Types =====================

export interface SkillWatchEvent {
  type: 'skill-added' | 'skill-changed' | 'skill-removed' | 'skill-audit-updated' | 'skill-install-progress';
  dirName?: string;
  name?: string;
  skillId?: string;
  level?: string;
  score?: number;
  timestamp: number;
  installId?: string;
  phase?: string;
  message?: string;
  percent?: number;
  error?: string;
}

interface WatchDirEntry {
  watcher: chokidar.FSWatcher;
  refCount: number;
  skillsDir: string;
}

// ===================== Constants =====================

/** 空闲 TTL（毫秒），60 分钟无活动且无客户端则关闭 */
const IDLE_TTL_MS = 3600000;

/** 空闲检查间隔（毫秒），每 5 分钟检查一次 */
const IDLE_CHECK_INTERVAL_MS = 300000;

/** 默认忽略的目录模式 */
const DEFAULT_IGNORED_DIRS = [
  '.git',
  'node_modules',
  'dist',
  '.venv',
  '__pycache__',
];

/** 默认忽略的临时文件后缀 */
const DEFAULT_IGNORED_TEMP_SUFFIXES = ['.tmp', '.swp', '~'];

// ===================== SkillWatcher Class =====================

class SkillWatcher {
  /** 多目录 watcher 映射：dir -> WatchDirEntry */
  private watchers = new Map<string, WatchDirEntry>();

  /** SSE 客户端集合 */
  private clients: Set<Response> = new Set();

  /** 防抖计时器 */
  private debounceTimer: NodeJS.Timeout | null = null;

  /** 最后活动时间 */
  private lastActivityAt: number = Date.now();

  /** 空闲检查计时器 */
  private idleCheckTimer: NodeJS.Timeout | null = null;

  /**
   * 初始化 chokidar 监听器（默认技能目录）
   */
  init(): void {
    const defaultSkillsDir = AppPaths.skillsDir;
    this.addWatchDir(defaultSkillsDir);
    this.startIdleCheck();
  }

  /**
   * 添加监听目录
   *
   * 如果目录已在监听中，增加引用计数，不重复创建 watcher。
   *
   * @param dir - 要监听的目录
   * @returns 是否成功添加
   */
  addWatchDir(dir: string): boolean {
    const resolvedDir = path.resolve(dir);

    const existing = this.watchers.get(resolvedDir);
    if (existing) {
      existing.refCount++;
      logger.info(`[SkillWatcher] Directory already watched, refCount=${existing.refCount}: ${resolvedDir}`);
      return true;
    }

    try {
      // 如果目录不存在，先创建
      if (!fs.existsSync(resolvedDir)) {
        logger.info(`[SkillWatcher] Directory does not exist, creating: ${resolvedDir}`);
        fs.mkdirSync(resolvedDir, { recursive: true });
      }

      const watcher = this.createWatcher(resolvedDir);

      this.watchers.set(resolvedDir, {
        watcher,
        refCount: 1,
        skillsDir: resolvedDir,
      });

      this.updateActivity();
      logger.info(`[SkillWatcher] Watcher added for directory: ${resolvedDir}`);
      return true;
    } catch (error) {
      logger.error(`[SkillWatcher] Failed to add watch dir ${resolvedDir}:`, error);
      return false;
    }
  }

  /**
   * 移除监听目录
   *
   * 减少引用计数，引用计数为 0 时关闭 watcher。
   *
   * @param dir - 要移除的目录
   * @returns 是否成功移除
   */
  removeWatchDir(dir: string): boolean {
    const resolvedDir = path.resolve(dir);
    const entry = this.watchers.get(resolvedDir);

    if (!entry) {
      logger.warn(`[SkillWatcher] Directory not watched: ${resolvedDir}`);
      return false;
    }

    entry.refCount--;

    if (entry.refCount <= 0) {
      entry.watcher.close();
      this.watchers.delete(resolvedDir);
      logger.info(`[SkillWatcher] Watcher removed for directory: ${resolvedDir}`);
    } else {
      logger.info(`[SkillWatcher] Directory refCount decreased to ${entry.refCount}: ${resolvedDir}`);
    }

    return true;
  }

  /**
   * 创建单个目录的 watcher
   */
  private createWatcher(skillsDir: string): chokidar.FSWatcher {
    logger.info(`[SkillWatcher] Initializing watcher for ${skillsDir}`);

    const ignoredPatterns = this.buildIgnoredPatterns();

    const watcher = chokidar.watch(path.join(skillsDir, '**', 'SKILL.md'), {
      ignored: ignoredPatterns,
      persistent: true,
      ignoreInitial: false,
      depth: 2,
    });

    // 防抖：避免短时间内多次文件变化触发多次扫描
    const debouncedScan = () => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        logger.info('[SkillWatcher] Debounced scan triggered');
        scanWorkbuddySkills();
      }, 500);
    };

    watcher
      .on('add', (filePath: string) => {
        this.updateActivity();
        logger.info(`[SkillWatcher] Skill added: ${filePath}`);
        const dirName = this.extractDirName(filePath, skillsDir);
        if (dirName) {
          this.broadcast({
            type: 'skill-added',
            dirName,
            name: dirName,
            timestamp: Date.now(),
          });
          debouncedScan();
        }
      })
      .on('change', async (filePath: string) => {
        this.updateActivity();
        logger.info(`[SkillWatcher] Skill changed: ${filePath}`);

        // 等待文件写入稳定
        try {
          const stable = await this.waitForStableFile(filePath);
          if (!stable) {
            logger.warn(`[SkillWatcher] File did not stabilize, proceeding anyway: ${filePath}`);
          }
        } catch (error) {
          logger.warn(`[SkillWatcher] waitForStableFile failed, proceeding: ${error}`);
        }

        const dirName = this.extractDirName(filePath, skillsDir);
        if (dirName) {
          this.broadcast({
            type: 'skill-changed',
            dirName,
            name: dirName,
            timestamp: Date.now(),
          });
          debouncedScan();

          // Auto-audit on change: SHA256 comparison + re-audit if version changed
          this.autoAuditOnChange(filePath, dirName);
        }
      })
      .on('unlink', (filePath: string) => {
        this.updateActivity();
        logger.info(`[SkillWatcher] Skill removed: ${filePath}`);
        const dirName = this.extractDirName(filePath, skillsDir);
        if (dirName) {
          this.broadcast({
            type: 'skill-removed',
            dirName,
            name: dirName,
            timestamp: Date.now(),
          });
          debouncedScan();
        }
      })
      .on('error', (error: Error) => {
        logger.error('[SkillWatcher] Watcher error:', error);
      });

    logger.info(`[SkillWatcher] Watcher initialized successfully for ${skillsDir}`);
    return watcher;
  }

  /**
   * 构建忽略规则
   */
  private buildIgnoredPatterns(): RegExp[] {
    const patterns: RegExp[] = [];

    // 忽略隐藏文件/目录（原有逻辑）
    patterns.push(/(^|[\/\\])\../);

    // 忽略常见目录
    for (const dir of DEFAULT_IGNORED_DIRS) {
      patterns.push(new RegExp(`[\/\\\\]${dir}[\/\\\\]`, 'i'));
    }

    // 忽略临时文件后缀
    for (const suffix of DEFAULT_IGNORED_TEMP_SUFFIXES) {
      const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      patterns.push(new RegExp(`${escaped}$`, 'i'));
    }

    return patterns;
  }

  /**
   * 等待文件大小稳定
   *
   * 每隔 intervalMs 检查一次文件大小，连续 2 次相同则认为稳定。
   * 超过 maxWaitMs 强制继续。
   *
   * @param filePath - 文件路径
   * @param intervalMs - 检查间隔（毫秒），默认 200ms
   * @param maxWaitMs - 最大等待时间（毫秒），默认 2000ms
   * @returns 是否在超时前稳定
   */
  async waitForStableFile(filePath: string, intervalMs = 200, maxWaitMs = 2000): Promise<boolean> {
    const startTime = Date.now();
    let lastSize: number | null = null;
    let stableCount = 0;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const stats = fs.statSync(filePath);
        const currentSize = stats.size;

        if (lastSize !== null && currentSize === lastSize) {
          stableCount++;
          if (stableCount >= 2) {
            logger.debug(`[SkillWatcher] File stabilized after ${Date.now() - startTime}ms: ${filePath}`);
            return true;
          }
        } else {
          stableCount = 0;
          lastSize = currentSize;
        }
      } catch (error) {
        logger.debug(`[SkillWatcher] Failed to stat file during stability check: ${filePath}`, error);
        return false;
      }

      await this.sleep(intervalMs);
    }

    logger.warn(`[SkillWatcher] File stability check timed out after ${maxWaitMs}ms: ${filePath}`);
    return false;
  }

  /**
   * 从文件路径提取技能目录名
   */
  private extractDirName(filePath: string, skillsDir: string): string | null {
    const relativePath = path.relative(skillsDir, filePath);
    const parts = relativePath.split(path.sep);
    if (parts.length >= 2) {
      return parts[0];
    }
    return null;
  }

  /**
   * 注册 SSE 客户端
   */
  addClient(res: Response): void {
    this.clients.add(res);
    this.updateActivity();

    // 如果没有活动的 watcher 但有客户端连接，重新初始化默认目录
    if (this.watchers.size === 0) {
      logger.info('[SkillWatcher] Client connected but no watchers active, reinitializing...');
      this.init();
    }

    logger.info(`[SkillWatcher] SSE client connected, total clients: ${this.clients.size}`);
  }

  /**
   * 移除 SSE 客户端
   */
  removeClient(res: Response): void {
    this.clients.delete(res);
    this.updateActivity();
    logger.info(`[SkillWatcher] SSE client disconnected, total clients: ${this.clients.size}`);
  }

  /**
   * 广播事件给所有连接的客户端
   */
  broadcast(event: SkillWatchEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(data);
      } catch (e) {
        logger.error('[SkillWatcher] Failed to send event to client:', e);
        this.clients.delete(client);
      }
    }
  }

  /**
   * Auto-audit on file change: compare SHA256 hash and re-audit if version changed.
   */
  private async autoAuditOnChange(filePath: string, dirName: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const newVersion = crypto.createHash('sha256').update(content).digest('hex');

      const existingAudit = getLatestSkillAudit(dirName);

      if (!existingAudit || existingAudit.skill_version !== newVersion) {
        // Version changed, trigger re-audit
        const result = await auditSkillMd(filePath, content);
        const id = uuidv4();

        createSkillAudit({
          id,
          skillId: dirName,
          skillVersion: newVersion,
          score: result.summary.score,
          level: result.summary.level,
          reportJson: JSON.stringify(result),
          reportMarkdown: generateMarkdownReport(result),
          triggeredBy: 'hot-reload',
        });

        // Broadcast audit update event
        this.broadcast({
          type: 'skill-audit-updated',
          skillId: dirName,
          level: result.summary.level,
          score: result.summary.score,
          timestamp: Date.now(),
        });

        logger.info(
          `[SkillWatcher] Auto-audit complete for "${dirName}": score=${result.summary.score}, level=${result.summary.level}`
        );
      }
    } catch (e) {
      logger.error(`[SkillWatcher] Auto-audit failed for ${filePath}:`, e);
    }
  }

  // ===================== 空闲管理 =====================

  /**
   * 更新最后活动时间
   */
  private updateActivity(): void {
    this.lastActivityAt = Date.now();
  }

  /**
   * 启动空闲检查定时器
   */
  private startIdleCheck(): void {
    if (this.idleCheckTimer) {
      return;
    }

    this.idleCheckTimer = setInterval(() => {
      this.checkIdle();
    }, IDLE_CHECK_INTERVAL_MS);

    logger.debug('[SkillWatcher] Idle check timer started');
  }

  /**
   * 检查是否空闲并清理
   */
  private checkIdle(): void {
    const now = Date.now();
    const idleTime = now - this.lastActivityAt;

    logger.debug(
      `[SkillWatcher] Idle check: idleTime=${Math.round(idleTime / 1000)}s, ` +
      `clients=${this.clients.size}, watchers=${this.watchers.size}`
    );

    // 超过 TTL 且没有客户端连接，则关闭所有 watcher
    if (idleTime > IDLE_TTL_MS && this.clients.size === 0 && this.watchers.size > 0) {
      logger.info('[SkillWatcher] Idle TTL reached, closing all watchers...');
      this.destroyAllWatchers();
    }
  }

  /**
   * 销毁所有 watcher
   */
  private destroyAllWatchers(): void {
    for (const [dir, entry] of this.watchers) {
      try {
        entry.watcher.close();
        logger.debug(`[SkillWatcher] Closed watcher for: ${dir}`);
      } catch (error) {
        logger.error(`[SkillWatcher] Error closing watcher for ${dir}:`, error);
      }
    }
    this.watchers.clear();
    logger.info('[SkillWatcher] All watchers destroyed');
  }

  /**
   * 销毁监听器，清理资源
   */
  destroy(): void {
    this.destroyAllWatchers();

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }

    this.clients.clear();
    logger.info('[SkillWatcher] Watcher destroyed completely');
  }

  /**
   * 简单的 sleep 工具函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ===================== Singleton Export =====================

const skillWatcher = new SkillWatcher();
export default skillWatcher;
