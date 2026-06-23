/**
 * Skill Watcher Service
 * chokidar 监听 ~/.workbuddy/skills/ 下 SKILL.md 变化，通过 SSE 广播给前端
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

// ===================== Types =====================

export interface SkillWatchEvent {
  type: 'skill-added' | 'skill-changed' | 'skill-removed' | 'skill-audit-updated';
  dirName?: string;
  name?: string;
  skillId?: string;
  level?: string;
  score?: number;
  timestamp: number;
}

// ===================== SkillWatcher Class =====================

class SkillWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private clients: Set<Response> = new Set();
  private debounceTimer: NodeJS.Timeout | null = null;

  /**
   * 初始化 chokidar 监听器
   */
  init(): void {
    if (this.watcher) {
      logger.info('[SkillWatcher] Already initialized, skipping.');
      return;
    }

    const skillsDir = path.join(os.homedir(), '.workbuddy', 'skills');
    logger.info(`[SkillWatcher] Initializing watcher for ${skillsDir}`);

    // 如果目录不存在，先创建
    if (!fs.existsSync(skillsDir)) {
      logger.info(`[SkillWatcher] Skills directory does not exist, creating: ${skillsDir}`);
      fs.mkdirSync(skillsDir, { recursive: true });
    }

    this.watcher = chokidar.watch(path.join(skillsDir, '**', 'SKILL.md'), {
      ignored: /(^|[\/\\])\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: false, // 初始扫描也触发事件
      depth: 2, // 只监听两层深度
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

    this.watcher
      .on('add', (filePath: string) => {
        logger.info(`[SkillWatcher] Skill added: ${filePath}`);
        const dirName = this.extractDirName(filePath);
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
      .on('change', (filePath: string) => {
        logger.info(`[SkillWatcher] Skill changed: ${filePath}`);
        const dirName = this.extractDirName(filePath);
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
        logger.info(`[SkillWatcher] Skill removed: ${filePath}`);
        const dirName = this.extractDirName(filePath);
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

    logger.info('[SkillWatcher] Watcher initialized successfully');
  }

  /**
   * 从文件路径提取技能目录名
   */
  private extractDirName(filePath: string): string | null {
    const skillsDir = path.join(os.homedir(), '.workbuddy', 'skills');
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
    logger.info(`[SkillWatcher] SSE client connected, total clients: ${this.clients.size}`);
  }

  /**
   * 移除 SSE 客户端
   */
  removeClient(res: Response): void {
    this.clients.delete(res);
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
    logger.info('[SkillWatcher] Watcher destroyed');
  }
}

// ===================== Singleton Export =====================

const skillWatcher = new SkillWatcher();
export default skillWatcher;
