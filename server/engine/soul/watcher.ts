/**
 * Soul Watcher Service — 人格规则文件热更新监听器
 *
 * 功能：
 * 1. 监听 SOUL.md / USER.md 文件变化（使用 chokidar）
 * 2. 文件变化时自动重新加载规则配置
 * 3. 通过 SSE 通知前端更新
 * 4. 支持批量更新延迟（防抖，避免频繁刷新）
 *
 * 参考 skillWatcher.ts 和 configHotReload.ts 的架构设计
 */

import chokidar, { type FSWatcher } from 'chokidar';
import type { Response } from 'express';
import path from 'path';
import fs from 'fs';
import { logger } from '../../logger.js';
import { AppPaths } from '../../config/appPaths.js';
import {
  loadSoulProfile,
  invalidateSoulCache,
  type SoulProfile,
} from '../soulLoader.js';

// ===================== Types =====================

export type SoulFileType = 'soul' | 'user';

export interface SoulWatchEvent {
  type: 'soul-changed' | 'user-changed' | 'error';
  fileType: SoulFileType;
  timestamp: number;
  profile?: SoulProfile;
  error?: string;
}

export interface SoulFileContent {
  type: SoulFileType;
  path: string;
  content: string;
  lastModified: number;
}

// ===================== SoulWatcher Class =====================

class SoulWatcher {
  private watcher: FSWatcher | null = null;
  private clients: Set<Response> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;
  private debounceMs = 500; // 500ms 防抖延迟
  private lastProfile: SoulProfile | null = null;

  /**
   * 初始化 chokidar 监听器
   */
  init(): void {
    if (this.watcher) {
      logger.info('[SoulWatcher] Already initialized, skipping.');
      return;
    }

    const soulPath = path.join(AppPaths.rootDir, 'SOUL.md');
    const userPath = path.join(AppPaths.rootDir, 'USER.md');

    logger.info(`[SoulWatcher] Initializing watcher for:`);
    logger.info(`  - SOUL.md: ${soulPath}`);
    logger.info(`  - USER.md: ${userPath}`);

    // 确保文件存在（soulLoader.ts 已初始化默认文件）
    this.ensureFilesExist([soulPath, userPath]);

    // 初始加载
    this.lastProfile = loadSoulProfile(true);

    // 监听两个文件
    this.watcher = chokidar.watch([soulPath, userPath], {
      persistent: true,
      ignoreInitial: true, // 忽略初始扫描事件（已手动加载）
      awaitWriteFinish: {
        stabilityThreshold: 200, // 等待文件写入稳定
        pollInterval: 100,
      },
    });

    // 防抖处理：避免短时间内多次文件变化触发多次重载
    const debouncedReload = (fileType: SoulFileType) => {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      this.debounceTimer = setTimeout(() => {
        this.handleFileChange(fileType);
      }, this.debounceMs);
    };

    this.watcher
      .on('change', (filePath: string) => {
        const fileType = this.getFileType(filePath);
        logger.info(`[SoulWatcher] File changed: ${filePath} (${fileType})`);
        debouncedReload(fileType);
      })
      .on('error', (error: Error) => {
        logger.error('[SoulWatcher] Watcher error:', error);
        this.broadcast({
          type: 'error',
          fileType: 'soul',
          timestamp: Date.now(),
          error: error.message,
        });
      });

    logger.info('[SoulWatcher] Watcher initialized successfully');
  }

  /**
   * 确保文件存在
   */
  private ensureFilesExist(filePaths: string[]): void {
    for (const filePath of filePaths) {
      if (!fs.existsSync(filePath)) {
        logger.warn(`[SoulWatcher] File does not exist: ${filePath}`);
      }
    }
  }

  /**
   * 从文件路径获取文件类型
   */
  private getFileType(filePath: string): SoulFileType {
    const fileName = path.basename(filePath).toLowerCase();
    if (fileName === 'soul.md') return 'soul';
    if (fileName === 'user.md') return 'user';
    return 'soul'; // 默认
  }

  /**
   * 处理文件变化
   */
  private handleFileChange(fileType: SoulFileType): void {
    try {
      // 清除缓存并重新加载
      invalidateSoulCache();
      const newProfile = loadSoulProfile(true);
      this.lastProfile = newProfile;

      logger.info(`[SoulWatcher] Profile reloaded: personality=${newProfile.personality}`);

      // 广播更新事件
      this.broadcast({
        type: fileType === 'soul' ? 'soul-changed' : 'user-changed',
        fileType,
        timestamp: Date.now(),
        profile: newProfile,
      });
    } catch (error) {
      logger.error(`[SoulWatcher] Failed to reload profile:`, error);
      this.broadcast({
        type: 'error',
        fileType,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * 注册 SSE 客户端
   */
  addClient(res: Response): void {
    this.clients.add(res);
    logger.info(`[SoulWatcher] SSE client connected, total clients: ${this.clients.size}`);

    // 发送当前状态
    if (this.lastProfile) {
      try {
        res.write(`data: ${JSON.stringify({
          type: 'initial-state',
          fileType: 'soul',
          timestamp: Date.now(),
          profile: this.lastProfile,
        })}\n\n`);
      } catch (e) {
        logger.error('[SoulWatcher] Failed to send initial state:', e);
      }
    }
  }

  /**
   * 移除 SSE 客户端
   */
  removeClient(res: Response): void {
    this.clients.delete(res);
    logger.info(`[SoulWatcher] SSE client disconnected, total clients: ${this.clients.size}`);
  }

  /**
   * 广播事件给所有连接的客户端
   */
  broadcast(event: SoulWatchEvent): void {
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(data);
      } catch (e) {
        logger.error('[SoulWatcher] Failed to send event to client:', e);
        this.clients.delete(client);
      }
    }
  }

  /**
   * 获取当前 Soul 配置
   */
  getCurrentProfile(): SoulProfile | null {
    if (!this.lastProfile) {
      this.lastProfile = loadSoulProfile(true);
    }
    return this.lastProfile;
  }

  /**
   * 获取所有 Soul 文件内容
   */
  getAllSoulFiles(): SoulFileContent[] {
    const files: SoulFileContent[] = [];

    const soulPath = path.join(AppPaths.rootDir, 'SOUL.md');
    const userPath = path.join(AppPaths.rootDir, 'USER.md');

    if (fs.existsSync(soulPath)) {
      const stat = fs.statSync(soulPath);
      files.push({
        type: 'soul',
        path: soulPath,
        content: fs.readFileSync(soulPath, 'utf-8'),
        lastModified: stat.mtimeMs,
      });
    }

    if (fs.existsSync(userPath)) {
      const stat = fs.statSync(userPath);
      files.push({
        type: 'user',
        path: userPath,
        content: fs.readFileSync(userPath, 'utf-8'),
        lastModified: stat.mtimeMs,
      });
    }

    return files;
  }

  /**
   * 手动重新加载（API 触发）
   */
  reload(): SoulProfile {
    invalidateSoulCache();
    const profile = loadSoulProfile(true);
    this.lastProfile = profile;

    // 广播更新
    this.broadcast({
      type: 'soul-changed',
      fileType: 'soul',
      timestamp: Date.now(),
      profile,
    });

    return profile;
  }

  /**
   * 更新文件内容（API 触发）
   */
  updateFile(fileType: SoulFileType, content: string): void {
    const filePath = fileType === 'soul'
      ? path.join(AppPaths.rootDir, 'SOUL.md')
      : path.join(AppPaths.rootDir, 'USER.md');

    try {
      fs.writeFileSync(filePath, content, 'utf-8');
      logger.info(`[SoulWatcher] File updated: ${filePath}`);

      // chokidar 会自动检测变化并触发 reload，无需手动调用
    } catch (error) {
      logger.error(`[SoulWatcher] Failed to update file:`, error);
      throw error;
    }
  }

  /**
   * 销毁监听器，清理资源
   */
  destroy(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.clients.clear();
    this.lastProfile = null;
    logger.info('[SoulWatcher] Watcher destroyed');
  }
}

// ===================== Singleton Export =====================

const soulWatcher = new SoulWatcher();
export default soulWatcher;