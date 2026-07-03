/**
 * Remote Skill Loader — 远程 Skill 加载器
 *
 * 支持从远程源加载 Skill（如远程注册表、Git 仓库等）：
 * 1. 远程注册表加载 — 从远程 Skill 注册表下载
 * 2. 本地缓存 — 缓存已下载的 Skill
 * 3. 版本管理 — 支持版本锁定和更新
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';
import type {
  SkillDefinition,
} from '../types/skill-runtime.js';

const execAsync = promisify(exec);

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

/** 安装进度回调 */
export type InstallProgressCallback = (stage: string, percent: number) => void;

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
  /** 下载超时（毫秒） */
  downloadTimeoutMs?: number;
}

/** 已安装 Skill 记录（installed.json 格式） */
interface InstalledRecord {
  version: string;
  installedAt: number;
  source: string;
  sourceType: RemoteSkillSourceType;
}

/** installed.json 文件结构 */
interface InstalledManifest {
  [skillId: string]: InstalledRecord;
}

// ===================== 常量 =====================

const DEFAULT_DOWNLOAD_TIMEOUT = 5 * 60 * 1000;
const INSTALLED_MANIFEST = 'installed.json';
const SKILL_DIR_NAME = 'skill';

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
      downloadTimeoutMs: config.downloadTimeoutMs ?? DEFAULT_DOWNLOAD_TIMEOUT,
    };

    this.ensureCacheDir();
    this.loadInstalledManifest();
  }

  // ===================== 1. 配置管理 =====================

  /**
   * 添加远程源
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
   */
  async searchSkills(query: string): Promise<RemoteSkillInfo[]> {
    logger.debug(`[RemoteSkillLoader] Searching for: ${query}`);

    const results: RemoteSkillInfo[] = [];

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
    source: RemoteSkillSource,
    query: string,
  ): Promise<RemoteSkillInfo[]> {
    switch (source.type) {
      case 'registry':
        return this.searchFromRegistry(source, query);
      case 'git':
        return this.searchFromGit(source, query);
      case 'http':
        return this.searchFromHttp(source, query);
      case 'npm':
        return this.searchFromNpm(source, query);
      default:
        return [];
    }
  }

  /**
   * 从 registry 搜索
   * GET /search?q=xxx 返回 RemoteSkillInfo[]
   */
  private async searchFromRegistry(
    source: RemoteSkillSource,
    query: string,
  ): Promise<RemoteSkillInfo[]> {
    const url = new URL(source.url);
    url.pathname = url.pathname.endsWith('/')
      ? `${url.pathname}search`
      : `${url.pathname}/search`;
    url.searchParams.set('q', query);

    const response = await this.safeFetch(url.toString(), {
      headers: source.authToken
        ? { Authorization: `Bearer ${source.authToken}` }
        : undefined,
    });

    if (!response.ok) {
      logger.warn(`[RemoteSkillLoader] Registry search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const results = Array.isArray(data) ? data : data.results ?? data.skills ?? [];

    return results.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description || '',
      version: item.version || 'latest',
      author: item.author,
      tags: item.tags,
      source: source.url,
      downloadUrl: item.downloadUrl || item.url || '',
      size: item.size,
    }));
  }

  /**
   * 从 Git 仓库搜索
   * 解析仓库根目录下的 skills/ 子目录中的 SKILL.md
   */
  private async searchFromGit(
    source: RemoteSkillSource,
    query: string,
  ): Promise<RemoteSkillInfo[]> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-git-search-'));

    try {
      await execAsync(
        `git clone --depth 1 ${this.shellQuote(source.url)} ${this.shellQuote(tmpDir)}`,
        { timeout: this.config.downloadTimeoutMs, maxBuffer: 8 * 1024 * 1024 },
      );

      const skillsDir = path.join(tmpDir, 'skills');
      try {
        await fs.access(skillsDir);
      } catch {
        return [];
      }

      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      const skillDirs = entries.filter((e) => e.isDirectory());

      const results: RemoteSkillInfo[] = [];
      const queryLower = query.toLowerCase();

      for (const dir of skillDirs) {
        const skillMdPath = path.join(skillsDir, dir.name, 'SKILL.md');
        try {
          const content = await fs.readFile(skillMdPath, 'utf-8');
          const info = this.parseSkillMdHeader(content);

          if (!info.id && !info.name) continue;

          const id = info.id || dir.name;
          const name = info.name || dir.name;
          const description = info.description || '';

          if (query &&
              !id.toLowerCase().includes(queryLower) &&
              !name.toLowerCase().includes(queryLower) &&
              !description.toLowerCase().includes(queryLower)) {
            continue;
          }

          results.push({
            id,
            name,
            description,
            version: info.version || 'latest',
            author: info.author,
            tags: info.tags,
            source: source.url,
            downloadUrl: source.url,
          });
        } catch {
          // skip unreadable skills
        }
      }

      return results;
    } catch (e) {
      logger.warn(`[RemoteSkillLoader] Git search failed:`, e);
      return [];
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }

  /**
   * 从 HTTP 接口搜索（JSON API）
   */
  private async searchFromHttp(
    source: RemoteSkillSource,
    query: string,
  ): Promise<RemoteSkillInfo[]> {
    const url = new URL(source.url);
    url.searchParams.set('q', query);

    const response = await this.safeFetch(url.toString(), {
      headers: source.authToken
        ? { Authorization: `Bearer ${source.authToken}` }
        : undefined,
    });

    if (!response.ok) {
      logger.warn(`[RemoteSkillLoader] HTTP search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const items = Array.isArray(data) ? data : data.results ?? data.skills ?? data.data ?? [];

    return items.map((item: any) => ({
      id: item.id,
      name: item.name,
      description: item.description || '',
      version: item.version || 'latest',
      author: item.author,
      tags: item.tags,
      source: source.url,
      downloadUrl: item.downloadUrl || item.url || item.archiveUrl || '',
      size: item.size,
    }));
  }

  /**
   * 从 npm registry 搜索（查询 keywords: openclaw-skill）
   */
  private async searchFromNpm(
    source: RemoteSkillSource,
    query: string,
  ): Promise<RemoteSkillInfo[]> {
    const registryUrl = source.url || 'https://registry.npmjs.org/';
    const searchUrl = `${registryUrl}-/v1/search?text=${encodeURIComponent(query + ' keywords:openclaw-skill')}&size=20`;

    const response = await this.safeFetch(searchUrl, {
      headers: source.authToken
        ? { Authorization: `Bearer ${source.authToken}` }
        : undefined,
    });

    if (!response.ok) {
      logger.warn(`[RemoteSkillLoader] npm search failed: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const objects = data.objects ?? [];

    return objects.map((obj: any) => {
      const pkg = obj.package;
      return {
        id: pkg.name,
        name: pkg.name,
        description: pkg.description || '',
        version: pkg.version,
        author: pkg.author?.name,
        tags: pkg.keywords,
        source: registryUrl,
        downloadUrl: pkg.links?.tarball || '',
      };
    });
  }

  // ===================== 3. Skill 安装 =====================

  /**
   * 安装远程 Skill
   *
   * @param skillId - Skill ID
   * @param version - 版本（可选，默认最新）
   * @param sourceUrl - 源地址（可选，使用默认源）
   * @param targetDir - 目标安装目录（可选，默认安装到 cacheDir）
   * @param onProgress - 进度回调（可选）
   * @returns 安装结果
   */
  async installSkill(
    skillId: string,
    version?: string,
    sourceUrl?: string,
    targetDir?: string,
    onProgress?: InstallProgressCallback,
  ): Promise<InstallResult> {
    logger.info(`[RemoteSkillLoader] Installing skill: ${skillId}${version ? `@${version}` : ''}`);

    const emit = (stage: string, percent: number) => {
      try {
        onProgress?.(stage, percent);
      } catch (e) {
        logger.warn(`[RemoteSkillLoader] progress callback error:`, e);
      }
    };

    try {
      const source = this.findSource(sourceUrl);
      if (!source) {
        return {
          success: false,
          error: '未找到可用的远程源',
        };
      }

      emit('preparing', 5);

      const result = await this.downloadAndInstall(skillId, version, source, targetDir, emit);

      if (result.success && result.skillId && result.version && result.installedPath) {
        this.installed.set(result.skillId, {
          version: result.version,
          path: result.installedPath,
        });
        await this.saveInstalledManifest();
        emit('complete', 100);
      }

      return result;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      emit('error', 0);
      return {
        success: false,
        skillId,
        error: `安装失败: ${errorMsg}`,
      };
    }
  }

  /**
   * 卸载 Skill
   */
  async uninstallSkill(skillId: string): Promise<boolean> {
    const installed = this.installed.get(skillId);
    if (!installed) {
      logger.warn(`[RemoteSkillLoader] Skill not installed: ${skillId}`);
      return false;
    }

    try {
      await fs.rm(installed.path, { recursive: true, force: true });

      this.installed.delete(skillId);
      await this.saveInstalledManifest();
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
    skillId: string,
    version: string | undefined,
    source: RemoteSkillSource,
    targetDir: string | undefined,
    emit: InstallProgressCallback,
  ): Promise<InstallResult> {
    switch (source.type) {
      case 'registry':
        return this.installFromRegistry(skillId, version, source, targetDir, emit);
      case 'git':
        return this.installFromGit(skillId, version, source, targetDir, emit);
      case 'http':
        return this.installFromHttp(skillId, version, source, targetDir, emit);
      case 'npm':
        return this.installFromNpm(skillId, version, source, targetDir, emit);
      default:
        return {
          success: false,
          error: `不支持的源类型: ${source.type}`,
        };
    }
  }

  /**
   * 从 registry 下载安装
   */
  private async installFromRegistry(
    skillId: string,
    version: string | undefined,
    source: RemoteSkillSource,
    targetDir: string | undefined,
    emit: InstallProgressCallback,
  ): Promise<InstallResult> {
    try {
      emit('searching', 10);

      const url = new URL(source.url);
      url.pathname = url.pathname.endsWith('/')
        ? `${url.pathname}${encodeURIComponent(skillId)}`
        : `${url.pathname}/${encodeURIComponent(skillId)}`;
      if (version) {
        url.searchParams.set('version', version);
      }

      const response = await this.safeFetch(url.toString(), {
        headers: source.authToken
          ? { Authorization: `Bearer ${source.authToken}` }
          : undefined,
      });

      if (!response.ok) {
        return {
          success: false,
          skillId,
          error: `Registry 返回错误: ${response.status}`,
        };
      }

      const info = await response.json();
      const downloadUrl = info.downloadUrl || info.url;
      const resolvedVersion = info.version || version || 'latest';

      if (!downloadUrl) {
        return {
          success: false,
          skillId,
          error: '未找到下载地址',
        };
      }

      const installPath = this.resolveInstallPath(skillId, resolvedVersion, targetDir);
      emit('downloading', 30);

      await this.downloadAndExtract(downloadUrl, installPath, source.authToken);

      await this.recordInstall(skillId, resolvedVersion, source);

      return {
        success: true,
        skillId,
        version: resolvedVersion,
        installedPath: installPath,
      };
    } catch (e) {
      return {
        success: false,
        skillId,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * 从 Git 仓库安装
   */
  private async installFromGit(
    skillId: string,
    version: string | undefined,
    source: RemoteSkillSource,
    targetDir: string | undefined,
    emit: InstallProgressCallback,
  ): Promise<InstallResult> {
    const installPath = this.resolveInstallPath(skillId, version || 'latest', targetDir);

    try {
      emit('cloning', 20);

      await fs.rm(installPath, { recursive: true, force: true });

      const branchArg = version ? `--branch ${this.shellQuote(version)}` : '';
      await execAsync(
        `git clone --depth 1 ${branchArg} ${this.shellQuote(source.url)} ${this.shellQuote(installPath)}`.trim(),
        { timeout: this.config.downloadTimeoutMs, maxBuffer: 8 * 1024 * 1024 },
      );

      emit('verifying', 80);

      let resolvedVersion = version || 'latest';
      try {
        const { stdout } = await execAsync('git rev-parse HEAD', { cwd: installPath });
        resolvedVersion = stdout.trim().slice(0, 12);
      } catch {
        // ignore
      }

      await this.recordInstall(skillId, resolvedVersion, source);

      return {
        success: true,
        skillId,
        version: resolvedVersion,
        installedPath: installPath,
      };
    } catch (e) {
      try {
        await fs.rm(installPath, { recursive: true, force: true });
      } catch {
        // ignore
      }
      return {
        success: false,
        skillId,
        error: `Git 克隆失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  /**
   * 从 HTTP 下载安装
   */
  private async installFromHttp(
    skillId: string,
    version: string | undefined,
    source: RemoteSkillSource,
    targetDir: string | undefined,
    emit: InstallProgressCallback,
  ): Promise<InstallResult> {
    try {
      emit('downloading', 20);

      const installPath = this.resolveInstallPath(skillId, version || 'latest', targetDir);
      const downloadUrl = source.url;

      await this.downloadAndExtract(downloadUrl, installPath, source.authToken);

      await this.recordInstall(skillId, version || 'latest', source);

      return {
        success: true,
        skillId,
        version: version || 'latest',
        installedPath: installPath,
      };
    } catch (e) {
      return {
        success: false,
        skillId,
        error: `HTTP 下载失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  /**
   * 从 npm 安装
   */
  private async installFromNpm(
    skillId: string,
    version: string | undefined,
    source: RemoteSkillSource,
    targetDir: string | undefined,
    emit: InstallProgressCallback,
  ): Promise<InstallResult> {
    const installPath = this.resolveInstallPath(skillId, version || 'latest', targetDir);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-npm-'));

    try {
      emit('packing', 20);

      const pkgSpec = version ? `${skillId}@${version}` : skillId;
      await execAsync(
        `npm pack ${this.shellQuote(pkgSpec)} --pack-destination ${this.shellQuote(tmpDir)}`,
        {
          cwd: tmpDir,
          timeout: this.config.downloadTimeoutMs,
          maxBuffer: 8 * 1024 * 1024,
          env: {
            ...process.env,
            npm_config_registry: source.url || undefined,
          },
        },
      );

      emit('extracting', 60);

      const files = await fs.readdir(tmpDir);
      const tarball = files.find((f) => f.endsWith('.tgz') || f.endsWith('.tar.gz'));
      if (!tarball) {
        return {
          success: false,
          skillId,
          error: 'npm pack 未生成 tarball',
        };
      }

      const tarballPath = path.join(tmpDir, tarball);
      await fs.rm(installPath, { recursive: true, force: true });
      await fs.mkdir(installPath, { recursive: true });

      await execAsync(
        `tar -xzf ${this.shellQuote(tarballPath)} -C ${this.shellQuote(installPath)} --strip-components=1`,
        { timeout: this.config.downloadTimeoutMs, maxBuffer: 8 * 1024 * 1024 },
      );

      let resolvedVersion = version || 'latest';
      try {
        const pkgJsonPath = path.join(installPath, 'package.json');
        const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
        resolvedVersion = pkgJson.version || resolvedVersion;
      } catch {
        // ignore
      }

      await this.recordInstall(skillId, resolvedVersion, source);

      return {
        success: true,
        skillId,
        version: resolvedVersion,
        installedPath: installPath,
      };
    } catch (e) {
      try {
        await fs.rm(installPath, { recursive: true, force: true });
      } catch {
        // ignore
      }
      return {
        success: false,
        skillId,
        error: `npm 安装失败: ${e instanceof Error ? e.message : String(e)}`,
      };
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }

  // ===================== 4. 缓存管理 =====================

  /**
   * 确保缓存目录存在
   */
  private ensureCacheDir(): void {
    fs.mkdir(this.config.cacheDir, { recursive: true }).catch((e) => {
      logger.error('[RemoteSkillLoader] Failed to create cache dir:', e);
    });
  }

  /**
   * 清除缓存
   */
  async clearCache(): Promise<void> {
    try {
      await fs.rm(this.config.cacheDir, { recursive: true, force: true });
      await fs.mkdir(this.config.cacheDir, { recursive: true });
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

  // ===================== 5. 已安装清单管理 =====================

  /**
   * 从 installed.json 加载已安装清单
   */
  private async loadInstalledManifest(): Promise<void> {
    try {
      const manifestPath = path.join(this.config.cacheDir, INSTALLED_MANIFEST);
      const content = await fs.readFile(manifestPath, 'utf-8');
      const manifest: InstalledManifest = JSON.parse(content);

      for (const [skillId, record] of Object.entries(manifest)) {
        const skillPath = path.join(this.config.cacheDir, skillId, record.version);
        this.installed.set(skillId, {
          version: record.version,
          path: skillPath,
        });
      }
    } catch {
      // file may not exist yet
    }
  }

  /**
   * 保存已安装清单到 installed.json
   */
  private async saveInstalledManifest(): Promise<void> {
    try {
      const manifest: InstalledManifest = {};
      for (const [skillId, info] of this.installed.entries()) {
        manifest[skillId] = {
          version: info.version,
          installedAt: Date.now(),
          source: info.path,
          sourceType: 'registry',
        };
      }
      const manifestPath = path.join(this.config.cacheDir, INSTALLED_MANIFEST);
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    } catch (e) {
      logger.warn('[RemoteSkillLoader] Failed to save installed manifest:', e);
    }
  }

  /**
   * 记录一次安装到内存 map 和清单文件
   */
  private async recordInstall(
    skillId: string,
    version: string,
    source: RemoteSkillSource,
  ): Promise<void> {
    // We'll save the manifest via saveInstalledManifest which iterates `installed`.
    // The caller is responsible for updating `installed` map.
    // Here we just make sure the directory exists.
    try {
      await fs.mkdir(this.config.cacheDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  // ===================== 6. 辅助方法 =====================

  /**
   * 查找可用的源
   */
  private findSource(sourceUrl?: string): RemoteSkillSource | undefined {
    if (sourceUrl) {
      return this.config.sources.find((s) => s.url === sourceUrl && s.enabled);
    }

    return this.config.sources.find((s) => s.enabled);
  }

  /**
   * 解析安装路径
   */
  private resolveInstallPath(skillId: string, version: string, targetDir?: string): string {
    if (targetDir) {
      return targetDir;
    }
    return path.join(this.config.cacheDir, skillId, version);
  }

  /**
   * 下载并解压归档文件
   */
  private async downloadAndExtract(
    url: string,
    targetDir: string,
    authToken?: string,
  ): Promise<void> {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-download-'));

    try {
      const fileName = this.extractFileName(url);
      const filePath = path.join(tmpDir, fileName);

      const response = await this.safeFetch(url, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });

      if (!response.ok) {
        throw new Error(`下载失败: HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await fs.writeFile(filePath, buffer);

      await fs.rm(targetDir, { recursive: true, force: true });
      await fs.mkdir(targetDir, { recursive: true });

      const lower = fileName.toLowerCase();
      if (lower.endsWith('.zip')) {
        await execAsync(
          `unzip -q -o ${this.shellQuote(filePath)} -d ${this.shellQuote(targetDir)}`,
          { timeout: this.config.downloadTimeoutMs, maxBuffer: 8 * 1024 * 1024 },
        );
      } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
        await execAsync(
          `tar -xzf ${this.shellQuote(filePath)} -C ${this.shellQuote(targetDir)}`,
          { timeout: this.config.downloadTimeoutMs, maxBuffer: 8 * 1024 * 1024 },
        );
      } else if (lower.endsWith('.tar')) {
        await execAsync(
          `tar -xf ${this.shellQuote(filePath)} -C ${this.shellQuote(targetDir)}`,
          { timeout: this.config.downloadTimeoutMs, maxBuffer: 8 * 1024 * 1024 },
        );
      } else {
        const destFile = path.join(targetDir, fileName);
        await fs.copyFile(filePath, destFile);
      }
    } finally {
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
  }

  /**
   * 带超时的 fetch 封装
   */
  private async safeFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.downloadTimeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal as any,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 从 URL 提取文件名
   */
  private extractFileName(url: string): string {
    try {
      const u = new URL(url);
      const name = path.basename(u.pathname);
      return name || 'download.bin';
    } catch {
      return path.basename(url) || 'download.bin';
    }
  }

  /**
   * 简单的 shell 参数转义
   */
  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  /**
   * 解析 SKILL.md 文件头（frontmatter 简化版）
   */
  private parseSkillMdHeader(content: string): {
    id?: string;
    name?: string;
    description?: string;
    version?: string;
    author?: string;
    tags?: string[];
  } {
    const result: any = {};

    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = frontmatterMatch[1];
      const lines = frontmatter.split('\n');

      for (const line of lines) {
        const colonIndex = line.indexOf(':');
        if (colonIndex === -1) continue;

        const key = line.slice(0, colonIndex).trim();
        let value = line.slice(colonIndex + 1).trim();

        value = value.replace(/^['"]|['"]$/g, '');

        if (key === 'id') result.id = value;
        else if (key === 'name') result.name = value;
        else if (key === 'description') result.description = value;
        else if (key === 'version') result.version = value;
        else if (key === 'author') result.author = value;
        else if (key === 'tags') {
          if (value.startsWith('[') && value.endsWith(']')) {
            try {
              result.tags = JSON.parse(value);
            } catch {
              result.tags = value.slice(1, -1).split(',').map((s: string) => s.trim());
            }
          } else {
            result.tags = [value];
          }
        }
      }
    }

    return result;
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
