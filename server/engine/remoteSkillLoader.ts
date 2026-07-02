/**
 * Remote Skill Loader — 远程 Skill 加载器
 *
 * 支持从远程源加载 Skill（如远程注册表、Git 仓库等）：
 * 1. 远程注册表加载 — 从远程 Skill 注册表下载
 * 2. 本地缓存 — 缓存已下载的 Skill
 * 3. 版本管理 — 支持版本锁定和更新
 *
 * 当前实现为基础框架，后续可扩展具体的远程源。
 */

import fs from 'fs';
import path from 'path';
import { logger } from '../logger.js';
import type {
  SkillDefinition,
} from '../types/skill-runtime.js';

// ===================== 类型定义 =====================

/** 远程 Skill 源类型 */
export type RemoteSkillSourceType = 'registry' | 'git' | 'http' | 'npm';

/** 远程 Skill 源配置 */
export interface RemoteSkillSource {
  /** 源类型 */
  type: RemoteSkillSourceType;
  /** 源地址 */
  url: string;
  /** 认证 token（可选） */
  authToken?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 优先级（数字越小优先级越高） */
  priority: number;
}

/** 远程 Skill 元信息 */
export interface RemoteSkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags?: string[];
  source: string;
  downloadUrl: string;
  size?: number;
}

/** 安装结果 */
export interface InstallResult {
  success: boolean;
  skillId?: string;
  version?: string;
  error?: string;
  installedPath?: string;
}

/** 远程加载配置 */
export interface RemoteLoaderConfig {
  /** 缓存目录 */
  cacheDir: string;
  /** 远程源列表 */
  sources: RemoteSkillSource[];
  /** 默认源 */
  defaultSource?: string;
  /** 是否自动更新 */
  autoUpdate?: boolean;
}

// ===================== RemoteSkillLoader 类 =====================

/**
 * 远程 Skill 加载器
 */
export class RemoteSkillLoader {
  /** 配置 */
  private config: RemoteLoaderConfig;

  /** 已安装的 Skill：skillId → { version, path } */
  private installed = new Map<string, { version: string; path: string }>();

  constructor(config: Partial<RemoteLoaderConfig> = {}) {
    this.config = {
      cacheDir: config.cacheDir ?? path.join(process.cwd(), '.skill-cache'),
      sources: config.sources ?? [],
      defaultSource: config.defaultSource,
      autoUpdate: config.autoUpdate ?? false,
    };

    // 确保缓存目录存在
    this.ensureCacheDir();
  }

  // ===================== 1. 配置管理 =====================

  /**
   * 添加远程源
   *
   * @param source - 远程源配置
   */
  addSource(source: RemoteSkillSource): void {
    const existingIndex = this.config.sources.findIndex(
      (s) => s.url === source.url && s.type === source.type,
    );

    if (existingIndex !== -1) {
      this.config.sources[existingIndex] = source;
    } else {
      this.config.sources.push(source);
    }

    this.config.sources.sort((a, b) => a.priority - b.priority);
    logger.info(`[RemoteSkillLoader] Source added: ${source.type} - ${source.url}`);
  }

  /**
   * 移除远程源
   *
   * @param url - 源地址
   */
  removeSource(url: string): void {
    const index = this.config.sources.findIndex((s) => s.url === url);
    if (index !== -1) {
      this.config.sources.splice(index, 1);
      logger.info(`[RemoteSkillLoader] Source removed: ${url}`);
    }
  }

  /**
   * 获取配置
   */
  getConfig(): RemoteLoaderConfig {
    return { ...this.config, sources: [...this.config.sources] };
  }

  // ===================== 2. Skill 搜索 =====================

  /**
   * 搜索远程 Skill
   *
   * 基础实现：返回空列表（后续接入真实远程源）
   *
   * @param query - 搜索关键词
   * @returns Skill 列表
   */
  async searchSkills(query: string): Promise<RemoteSkillInfo[]> {
    logger.debug(`[RemoteSkillLoader] Searching for: ${query}`);

    const results: RemoteSkillInfo[] = [];

    // 遍历所有启用的源
    const enabledSources = this.config.sources.filter((s) => s.enabled);

    for (const source of enabledSources) {
      try {
        const sourceResults = await this.searchFromSource(source, query);
        results.push(...sourceResults);
      } catch (e) {
        logger.warn(`[RemoteSkillLoader] Search failed from ${source.url}:`, e);
      }
    }

    return results;
  }

  /**
   * 从单个源搜索
   */
  private async searchFromSource(
    _source: RemoteSkillSource,
    _query: string,
  ): Promise<RemoteSkillInfo[]> {
    // 基础实现：返回空列表
    // 后续可根据 source.type 实现不同的搜索逻辑
    return [];
  }

  // ===================== 3. Skill 安装 =====================

  /**
   * 安装远程 Skill
   *
   * @param skillId - Skill ID
   * @param version - 版本（可选，默认最新）
   * @param sourceUrl - 源地址（可选，使用默认源）
   * @returns 安装结果
   */
  async installSkill(
    skillId: string,
    version?: string,
    sourceUrl?: string,
  ): Promise<InstallResult> {
    logger.info(`[RemoteSkillLoader] Installing skill: ${skillId}${version ? `@${version}` : ''}`);

    try {
      // 查找源
      const source = this.findSource(sourceUrl);
      if (!source) {
        return {
          success: false,
          error: '未找到可用的远程源',
        };
      }

      // 下载并安装
      const result = await this.downloadAndInstall(skillId, version, source);
      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        skillId,
        error: `安装失败: ${errorMsg}`,
      };
    }
  }

  /**
   * 卸载 Skill
   *
   * @param skillId - Skill ID
   * @returns 是否成功
   */
  async uninstallSkill(skillId: string): Promise<boolean> {
    const installed = this.installed.get(skillId);
    if (!installed) {
      logger.warn(`[RemoteSkillLoader] Skill not installed: ${skillId}`);
      return false;
    }

    try {
      // 移除目录
      if (fs.existsSync(installed.path)) {
        fs.rmSync(installed.path, { recursive: true, force: true });
      }

      this.installed.delete(skillId);
      logger.info(`[RemoteSkillLoader] Skill uninstalled: ${skillId}`);
      return true;
    } catch (e) {
      logger.error(`[RemoteSkillLoader] Uninstall failed for ${skillId}:`, e);
      return false;
    }
  }

  /**
   * 下载并安装
   */
  private async downloadAndInstall(
    _skillId: string,
    _version: string | undefined,
    _source: RemoteSkillSource,
  ): Promise<InstallResult> {
    // 基础实现：返回不支持
    // 后续可根据 source.type 实现不同的下载逻辑
    return {
      success: false,
      error: '远程 Skill 安装功能开发中',
    };
  }

  // ===================== 4. 缓存管理 =====================

  /**
   * 确保缓存目录存在
   */
  private ensureCacheDir(): void {
    try {
      if (!fs.existsSync(this.config.cacheDir)) {
        fs.mkdirSync(this.config.cacheDir, { recursive: true });
      }
    } catch (e) {
      logger.error('[RemoteSkillLoader] Failed to create cache dir:', e);
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    try {
      if (fs.existsSync(this.config.cacheDir)) {
        fs.rmSync(this.config.cacheDir, { recursive: true, force: true });
        fs.mkdirSync(this.config.cacheDir, { recursive: true });
      }
      this.installed.clear();
      logger.info('[RemoteSkillLoader] Cache cleared.');
    } catch (e) {
      logger.error('[RemoteSkillLoader] Clear cache failed:', e);
    }
  }

  /**
   * 获取已安装的 Skill 列表
   */
  getInstalledSkills(): Array<{ id: string; version: string; path: string }> {
    return Array.from(this.installed.entries()).map(([id, info]) => ({
      id,
      ...info,
    }));
  }

  // ===================== 5. 辅助方法 =====================

  /**
   * 查找可用的源
   */
  private findSource(sourceUrl?: string): RemoteSkillSource | undefined {
    if (sourceUrl) {
      return this.config.sources.find((s) => s.url === sourceUrl && s.enabled);
    }

    // 返回第一个启用的源
    return this.config.sources.find((s) => s.enabled);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    sources: number;
    enabledSources: number;
    installed: number;
    cacheDir: string;
  } {
    return {
      sources: this.config.sources.length,
      enabledSources: this.config.sources.filter((s) => s.enabled).length,
      installed: this.installed.size,
      cacheDir: this.config.cacheDir,
    };
  }
}

// ===================== Module-level Singleton =====================

/** 远程 Skill 加载器单例 */
export const remoteSkillLoader = new RemoteSkillLoader();
