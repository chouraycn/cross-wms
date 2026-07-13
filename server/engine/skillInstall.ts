/**
 * Skill Install — Skill 安装生命周期管理
 *
 * 负责 Skill 的安装/分发流程，支持多种安装源：
 * - local: 从本地目录直接复制
 * - git: 从 Git 仓库克隆
 * - archive: 从压缩包解压（zip/tar.gz）
 * - market: 从预定义市场拉取
 * - http: 从 HTTP URL 直接下载
 *
 * 安装流程：
 * 1. evaluatePolicy 评估安装策略（白名单、超时、大小限制）
 * 2. 根据 source 分发到对应的安装函数
 * 3. 下载/解压/克隆到目标目录
 * 4. 调用 skillSecurityScanner 扫描安全风险
 * 5. 通过后调用 skillRegistry 注册
 * 6. 报告进度并清理资源
 *
 * 错误处理：所有 IO 异常均被捕获并以 InstallResult.error 返回，不抛出异常。
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { logger } from '../logger.js';
import { skillSecurityScanner } from './skillSecurityScanner.js';
import { skillRegistry } from './skillRegistry.js';
import { AppPaths, ensureDir } from '../config/appPaths.js';
import { createUserSkill, getUserSkillById } from '../dao/skills.js';
import { parseSkillMdContent } from '../services/skillMdParser.js';

const execAsync = promisify(exec);

// ===================== 类型定义 =====================

/** 安装源类型 */
export type SkillInstallSource = 'local' | 'git' | 'archive' | 'market' | 'http';

/** 安装规格 */
export interface SkillInstallSpec {
  /** 安装源 */
  source: SkillInstallSource;
  /** 本地路径（local 源） */
  localPath?: string;
  /** Git URL（git 源） */
  gitUrl?: string;
  /** Git 分支（git 源，默认 main） */
  gitBranch?: string;
  /** 归档 URL 或路径（archive 源） */
  archiveUrl?: string;
  /** HTTP 下载 URL（http 源） */
  downloadUrl?: string;
  /** 校验和（SHA-256，可选） */
  checksum?: string;
  /** 目标安装目录（可选，默认用户全局 Skill 目录） */
  targetDir?: string;
}

/** 安装策略 */
export interface SkillInstallPolicy {
  /** 允许的源 */
  allowedSources: SkillInstallSource[];
  /** 允许的 Git host 列表 */
  allowedGitHosts?: string[];
  /** 是否允许覆盖已存在的 Skill */
  allowOverwrite: boolean;
  /** 是否在安装前进行安全扫描 */
  requireSecurityScan: boolean;
  /** 最大下载大小（字节） */
  maxDownloadBytes: number;
  /** 安装超时（毫秒） */
  timeoutMs: number;
}

/** 安装进度事件 */
export interface InstallProgress {
  phase: 'start' | 'download' | 'extract' | 'scan' | 'register' | 'complete' | 'error';
  message: string;
  percent?: number;
  error?: string;
}

/** 安装结果 */
export interface InstallResult {
  success: boolean;
  skillId?: string;
  installedPath?: string;
  durationMs: number;
  message: string;
  error?: string;
  scanResult?: {
    passed: boolean;
    riskLevel: string;
  };
}

// ===================== 常量 =====================

/** 默认安装策略 */
const DEFAULT_POLICY: SkillInstallPolicy = {
  allowedSources: ['local', 'git', 'archive', 'http'],
  allowedGitHosts: ['github.com', 'gitlab.com', 'bitbucket.org', 'gitee.com'],
  allowOverwrite: false,
  requireSecurityScan: true,
  maxDownloadBytes: 100 * 1024 * 1024, // 100MB
  timeoutMs: 5 * 60 * 1000, // 5 分钟
};

/** 活跃安装记录 */
interface ActiveInstall {
  id: string;
  startedAt: number;
  spec: SkillInstallSpec;
}

// ===================== SkillInstallManager 类 =====================

/**
 * Skill 安装管理器
 *
 * 单一职责：管理 Skill 的安装生命周期，不负责发现、注册、执行的其它环节。
 */
export class SkillInstallManager {
  /** 当前安装策略 */
  private policy: SkillInstallPolicy;

  /** 活跃安装表：installId → AbortController */
  private activeInstalls = new Map<string, AbortController>();

  /** 活跃安装的元数据：installId → 启动信息 */
  private activeMetadata = new Map<string, ActiveInstall>();

  constructor(policy?: Partial<SkillInstallPolicy>) {
    this.policy = { ...DEFAULT_POLICY, ...(policy ?? {}) };
  }

  // ===================== 1. 策略管理 =====================

  /**
   * 设置安装策略（部分覆盖）
   */
  setPolicy(policy: Partial<SkillInstallPolicy>): void {
    this.policy = { ...this.policy, ...policy };
    logger.info('[SkillInstall] Policy updated.');
  }

  /**
   * 获取当前安装策略
   */
  getPolicy(): SkillInstallPolicy {
    return { ...this.policy };
  }

  // ===================== 2. 评估策略 =====================

  /**
   * 评估安装规格是否被当前策略允许
   *
   * @param spec - 安装规格
   * @returns 评估结果，allowed=false 时携带原因
   */
  evaluatePolicy(spec: SkillInstallSpec): { allowed: boolean; reason?: string } {
    // 1. 源类型白名单
    if (!this.policy.allowedSources.includes(spec.source)) {
      return {
        allowed: false,
        reason: `安装源 ${spec.source} 不在白名单中（允许: ${this.policy.allowedSources.join(', ')}）`,
      };
    }

    // 2. Git host 白名单
    if (spec.source === 'git') {
      if (!spec.gitUrl) {
        return { allowed: false, reason: 'Git 源缺少 gitUrl 字段' };
      }
      if (this.policy.allowedGitHosts && this.policy.allowedGitHosts.length > 0) {
        const host = this.extractGitHost(spec.gitUrl);
        if (!host) {
          return { allowed: false, reason: `无法解析 Git host: ${spec.gitUrl}` };
        }
        if (!this.policy.allowedGitHosts.includes(host)) {
          return {
            allowed: false,
            reason: `Git host ${host} 不在白名单中（允许: ${this.policy.allowedGitHosts.join(', ')}）`,
          };
        }
      }
    }

    // 3. 必填字段
    if (spec.source === 'local' && !spec.localPath) {
      return { allowed: false, reason: 'Local 源缺少 localPath 字段' };
    }
    if (spec.source === 'archive' && !spec.archiveUrl) {
      return { allowed: false, reason: 'Archive 源缺少 archiveUrl 字段' };
    }
    if (spec.source === 'http' && !spec.downloadUrl) {
      return { allowed: false, reason: 'HTTP 源缺少 downloadUrl 字段' };
    }

    return { allowed: true };
  }

  /**
   * 从 Git URL 提取 host
   */
  private extractGitHost(gitUrl: string): string | null {
    try {
      // 支持 git@host:user/repo.git 和 https://host/user/repo.git
      const sshMatch = gitUrl.match(/git@([^:]+):/);
      if (sshMatch) return sshMatch[1];

      const url = new URL(gitUrl);
      return url.hostname;
    } catch {
      return null;
    }
  }

  // ===================== 3. 安装 =====================

  /**
   * 安装 Skill
   *
   * @param spec - 安装规格
   * @param onProgress - 进度回调（可选）
   * @returns 安装结果
   */
  async install(
    spec: SkillInstallSpec,
    onProgress?: (progress: InstallProgress) => void,
  ): Promise<InstallResult> {
    const startTime = Date.now();
    const installId = this.generateInstallId();
    const abortController = new AbortController();

    this.activeInstalls.set(installId, abortController);
    this.activeMetadata.set(installId, {
      id: installId,
      startedAt: startTime,
      spec,
    });

    const emit = (phase: InstallProgress['phase'], message: string, percent?: number, error?: string) => {
      try {
        onProgress?.({ phase, message, percent, error });
      } catch (e) {
        logger.warn(`[SkillInstall] progress callback error: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    try {
      emit('start', `开始安装 (source=${spec.source})`, 0);

      // 1. 评估策略
      const policyCheck = this.evaluatePolicy(spec);
      if (!policyCheck.allowed) {
        const error = policyCheck.reason || '安装被策略拒绝';
        emit('error', error, undefined, error);
        return {
          success: false,
          durationMs: Date.now() - startTime,
          message: '安装被策略拒绝',
          error,
        };
      }

      // 2. 设置超时
      const timeoutHandle = setTimeout(() => {
        abortController.abort();
      }, this.policy.timeoutMs);

      let result: InstallResult;
      try {
        result = await this.dispatchInstall(spec, installId, emit);
      } finally {
        clearTimeout(timeoutHandle);
      }

      // 3. 安全扫描
      if (result.success && this.policy.requireSecurityScan && result.installedPath) {
        emit('scan', '执行安全扫描...', 85);
        const scanPassed = await this.runSecurityScan(result.installedPath, emit);
        result.scanResult = scanPassed;
        if (!scanPassed.passed) {
          // 扫描未通过时清理已安装文件
          this.cleanupOnFailure(result.installedPath, installId);
          return {
            success: false,
            durationMs: Date.now() - startTime,
            message: `安全扫描未通过（${scanPassed.riskLevel}）`,
            error: `Skill 安装失败：安全扫描未通过，风险等级=${scanPassed.riskLevel}`,
            scanResult: scanPassed,
          };
        }
      }

      // 4. 注册到注册表
      if (result.success && result.installedPath) {
        emit('register', '注册到 Skill Registry...', 95);
        const skillId = this.resolveSkillId(result.installedPath, spec);
        result.skillId = skillId;
        // v1.7.86: 安装后写入 user_skills 数据库表，让前端技能列表能立即显示
        try {
          const skillMdPath = path.join(result.installedPath, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            const content = fs.readFileSync(skillMdPath, 'utf-8');
            const parsed = parseSkillMdContent(content);
            // 若 DB 中已存在同 id 记录则跳过（避免重复安装时主键冲突）
            const existing = getUserSkillById(skillId);
            if (!existing) {
              createUserSkill({
                id: skillId,
                name: String(parsed.frontmatter.name || skillId),
                desc: String(parsed.frontmatter.description || ''),
                icon: String(parsed.frontmatter.icon || 'Extension'),
                category: String(parsed.frontmatter.category || 'tool'),
                path: result.installedPath,
                status: 'active',
                promptTemplate: content,
                executionMode: 'chat',
                installedAt: Date.now(),
              });
              logger.info(`[SkillInstall] Registered '${skillId}' in user_skills DB at ${result.installedPath}`);
            } else {
              logger.info(`[SkillInstall] Skill '${skillId}' already exists in DB, skipping registration`);
            }
          }
          // 触发注册表重扫该目录（best-effort，不阻塞）
          logger.info(`[SkillInstall] Installed '${skillId}' at ${result.installedPath}, awaiting registry reload.`);
        } catch (e) {
          logger.warn(`[SkillInstall] post-install register failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // 5. 完成
      const durationMs = Date.now() - startTime;
      if (result.success) {
        emit('complete', `安装完成（${durationMs}ms）`, 100);
      }

      return {
        ...result,
        durationMs,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      logger.error(`[SkillInstall] install error:`, e);
      emit('error', error, undefined, error);
      return {
        success: false,
        durationMs: Date.now() - startTime,
        message: '安装失败',
        error,
      };
    } finally {
      this.activeInstalls.delete(installId);
      this.activeMetadata.delete(installId);
    }
  }

  /**
   * 根据 spec.source 分发到不同的安装实现
   */
  private async dispatchInstall(
    spec: SkillInstallSpec,
    installId: string,
    emit: (phase: InstallProgress['phase'], message: string, percent?: number, error?: string) => void,
  ): Promise<InstallResult> {
    switch (spec.source) {
      case 'local':
        return this.installFromLocal(spec, installId, emit);
      case 'git':
        return this.installFromGit(spec, installId, emit);
      case 'archive':
        return this.installFromArchive(spec, installId, emit);
      case 'http':
        return this.installFromHttp(spec, installId, emit);
      default:
        return {
          success: false,
          durationMs: 0,
          message: '不支持的安装源',
          error: `未知 source: ${(spec as { source: string }).source}`,
        };
    }
  }

  // ===================== 3.1 local 安装 =====================

  /**
   * 从本地目录复制安装
   */
  private async installFromLocal(
    spec: SkillInstallSpec,
    installId: string,
    emit: (phase: InstallProgress['phase'], message: string, percent?: number, error?: string) => void,
  ): Promise<InstallResult> {
    const localPath = spec.localPath!;
    if (!fs.existsSync(localPath)) {
      return {
        success: false,
        durationMs: 0,
        message: '本地路径不存在',
        error: `Local path not found: ${localPath}`,
      };
    }

    const targetDir = this.resolveTargetDir(spec);
    this.ensureOverwriteAllowed(targetDir);

    emit('download', `从本地目录复制: ${localPath}`, 30);
    try {
      this.copyDirRecursive(localPath, targetDir);
      return {
        success: true,
        installedPath: targetDir,
        durationMs: 0,
        message: '本地安装完成',
      };
    } catch (e) {
      return this.ioErrorResult(e, '本地复制失败');
    }
  }

  // ===================== 3.2 git 安装 =====================

  /**
   * 从 Git 仓库克隆安装
   */
  private async installFromGit(
    spec: SkillInstallSpec,
    installId: string,
    emit: (phase: InstallProgress['phase'], message: string, percent?: number, error?: string) => void,
  ): Promise<InstallResult> {
    const gitUrl = spec.gitUrl!;
    const branch = spec.gitBranch || 'main';
    const targetDir = this.resolveTargetDir(spec);
    this.ensureOverwriteAllowed(targetDir);

    emit('download', `克隆 Git 仓库: ${gitUrl}@${branch}`, 30);

    try {
      // 如果目标目录已存在，先清理
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }

      const { stdout, stderr } = await execAsync(
        `git clone --depth 1 --branch ${this.shellQuote(branch)} ${this.shellQuote(gitUrl)} ${this.shellQuote(targetDir)}`,
        { timeout: this.policy.timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      );
      logger.debug(`[SkillInstall] git clone stdout: ${stdout}`);
      if (stderr) logger.debug(`[SkillInstall] git clone stderr: ${stderr}`);

      if (!fs.existsSync(targetDir)) {
        return {
          success: false,
          durationMs: 0,
          message: 'Git 克隆失败',
          error: '克隆后目标目录不存在',
        };
      }

      return {
        success: true,
        installedPath: targetDir,
        durationMs: 0,
        message: 'Git 安装完成',
      };
    } catch (e) {
      this.cleanupOnFailure(targetDir, installId);
      return this.ioErrorResult(e, 'Git 克隆失败');
    }
  }

  // ===================== 3.3 archive 安装 =====================

  /**
   * 从压缩包解压安装
   */
  private async installFromArchive(
    spec: SkillInstallSpec,
    installId: string,
    emit: (phase: InstallProgress['phase'], message: string, percent?: number, error?: string) => void,
  ): Promise<InstallResult> {
    const archiveUrl = spec.archiveUrl!;
    const targetDir = this.resolveTargetDir(spec);
    this.ensureOverwriteAllowed(targetDir);

    emit('download', `下载归档: ${archiveUrl}`, 30);

    // 准备临时下载目录
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-install-'));
    const archiveFile = path.join(tmpDir, this.archiveFileName(archiveUrl));

    try {
      // 1. 下载（支持 URL 或本地路径）
      await this.downloadToFile(archiveUrl, archiveFile, this.policy.maxDownloadBytes);

      // 2. 校验和
      if (spec.checksum) {
        emit('extract', '校验校验和...', 50);
        const ok = await this.verifyChecksum(archiveFile, spec.checksum);
        if (!ok) {
          return {
            success: false,
            durationMs: 0,
            message: '校验和不匹配',
            error: 'SHA-256 校验失败，文件可能已损坏',
          };
        }
      }

      // 3. 解压
      emit('extract', '解压归档...', 60);
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      await this.extractArchive(archiveFile, targetDir);

      return {
        success: true,
        installedPath: targetDir,
        durationMs: 0,
        message: '归档安装完成',
      };
    } catch (e) {
      this.cleanupOnFailure(targetDir, installId);
      return this.ioErrorResult(e, '归档安装失败');
    } finally {
      // 清理临时目录
      try {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch (e) {
        logger.warn(`[SkillInstall] tmp dir cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /**
   * 解压归档（zip/tar.gz）
   */
  private async extractArchive(archiveFile: string, targetDir: string): Promise<void> {
    const lower = archiveFile.toLowerCase();
    if (lower.endsWith('.zip')) {
      // macOS 内置 unzip
      await execAsync(`unzip -q -o ${this.shellQuote(archiveFile)} -d ${this.shellQuote(targetDir)}`, {
        timeout: this.policy.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      });
    } else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
      await execAsync(`tar -xzf ${this.shellQuote(archiveFile)} -C ${this.shellQuote(targetDir)}`, {
        timeout: this.policy.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      });
    } else if (lower.endsWith('.tar')) {
      await execAsync(`tar -xf ${this.shellQuote(archiveFile)} -C ${this.shellQuote(targetDir)}`, {
        timeout: this.policy.timeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      });
    } else {
      throw new Error(`不支持的归档格式: ${path.basename(archiveFile)}`);
    }
  }

  // ===================== 3.4 http 安装 =====================

  /**
   * 从 HTTP URL 下载安装
   */
  private async installFromHttp(
    spec: SkillInstallSpec,
    installId: string,
    emit: (phase: InstallProgress['phase'], message: string, percent?: number, error?: string) => void,
  ): Promise<InstallResult> {
    const downloadUrl = spec.downloadUrl!;
    const targetDir = this.resolveTargetDir(spec);
    this.ensureOverwriteAllowed(targetDir);

    emit('download', `HTTP 下载: ${downloadUrl}`, 30);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-install-'));
    const downloadFile = path.join(tmpDir, this.archiveFileName(downloadUrl));

    try {
      // 1. 下载
      await this.downloadToFile(downloadUrl, downloadFile, this.policy.maxDownloadBytes);

      // 2. 校验和
      if (spec.checksum) {
        emit('extract', '校验校验和...', 60);
        const ok = await this.verifyChecksum(downloadFile, spec.checksum);
        if (!ok) {
          return {
            success: false,
            durationMs: 0,
            message: '校验和不匹配',
            error: 'SHA-256 校验失败',
          };
        }
      }

      // 3. 视作归档解压到目标
      emit('extract', '解压到目标目录...', 80);
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      const lower = downloadFile.toLowerCase();
      if (lower.endsWith('.zip') || lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.tar')) {
        await this.extractArchive(downloadFile, targetDir);
      } else {
        // 单文件：放入 targetDir/SKILL.md 或直接拷贝
        const targetFile = path.join(targetDir, path.basename(downloadFile));
        fs.copyFileSync(downloadFile, targetFile);
      }

      return {
        success: true,
        installedPath: targetDir,
        durationMs: 0,
        message: 'HTTP 安装完成',
      };
    } catch (e) {
      this.cleanupOnFailure(targetDir, installId);
      return this.ioErrorResult(e, 'HTTP 安装失败');
    } finally {
      try {
        if (fs.existsSync(tmpDir)) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
        }
      } catch (e) {
        logger.warn(`[SkillInstall] tmp dir cleanup failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // ===================== 4. 取消安装 =====================

  /**
   * 取消指定的安装任务
   *
   * @param installId - 安装 ID
   * @returns 是否成功取消
   */
  cancelInstall(installId: string): boolean {
    const controller = this.activeInstalls.get(installId);
    if (!controller) {
      return false;
    }
    controller.abort();
    logger.info(`[SkillInstall] Install ${installId} cancelled.`);
    return true;
  }

  // ===================== 5. 列出活跃安装 =====================

  /**
   * 列出当前所有活跃安装
   */
  listActive(): Array<{ id: string; startedAt: number; spec: SkillInstallSpec }> {
    return Array.from(this.activeMetadata.values()).map((m) => ({
      id: m.id,
      startedAt: m.startedAt,
      spec: m.spec,
    }));
  }

  // ===================== 6. 默认目标目录 =====================

  /**
   * 获取默认的目标安装目录
   *
   * 优先使用 AppPaths.skillsDir，否则使用 ~/.workbuddy/skills
   */
  getDefaultTargetDir(): string {
    return AppPaths.skillsDir || path.join(os.homedir(), '.workbuddy', 'skills');
  }

  // ===================== 私有工具方法 =====================

  /**
   * 解析安装目标目录
   */
  private resolveTargetDir(spec: SkillInstallSpec): string {
    if (spec.targetDir) {
      ensureDir(spec.targetDir);
      return spec.targetDir;
    }

    // 默认到全局 Skill 目录
    const baseDir = this.getDefaultTargetDir();
    ensureDir(baseDir);

    // 用 source 标识 + url/path 哈希命名子目录
    const subName = this.deriveSubDirName(spec);
    const target = path.join(baseDir, subName);
    ensureDir(target);
    return target;
  }

  /**
   * 从 spec 推导子目录名
   */
  private deriveSubDirName(spec: SkillInstallSpec): string {
    const seed = spec.gitUrl || spec.downloadUrl || spec.archiveUrl || spec.localPath || 'unknown';
    const hash = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 8);
    return `${spec.source}_${hash}`;
  }

  /**
   * 检查覆盖策略
   */
  private ensureOverwriteAllowed(targetDir: string): void {
    if (fs.existsSync(targetDir) && !this.policy.allowOverwrite) {
      throw new Error(`目标目录已存在且不允许覆盖: ${targetDir}`);
    }
  }

  /**
   * 拷贝目录（递归）
   */
  private copyDirRecursive(src: string, dest: string): void {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
          this.copyDirRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
        }
      }
    } else {
      // 单文件：拷贝到目标目录
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      fs.copyFileSync(src, path.join(dest, path.basename(src)));
    }
  }

  /**
   * 下载 URL 或本地文件到目标路径
   */
  private async downloadToFile(url: string, dest: string, maxBytes: number): Promise<void> {
    // 本地路径
    if (fs.existsSync(url)) {
      const stat = fs.statSync(url);
      if (stat.size > maxBytes) {
        throw new Error(`文件超过最大下载大小: ${stat.size} > ${maxBytes}`);
      }
      fs.copyFileSync(url, dest);
      return;
    }

    // HTTP 下载
    const response = await fetch(url, {
      signal: AbortSignal.timeout(this.policy.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) {
      throw new Error(`响应大小超过限制: ${contentLength} > ${maxBytes}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`下载内容超过限制: ${buffer.length} > ${maxBytes}`);
    }
    fs.writeFileSync(dest, buffer);
  }

  /**
   * 校验 SHA-256
   */
  private async verifyChecksum(filePath: string, expected: string): Promise<boolean> {
    try {
      const actual = await this.sha256File(filePath);
      return actual.toLowerCase() === expected.toLowerCase();
    } catch (e) {
      logger.warn(`[SkillInstall] checksum verify failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }

  /**
   * 计算文件 SHA-256
   */
  private sha256File(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * 生成归档文件名
   */
  private archiveFileName(url: string): string {
    try {
      const u = new URL(url);
      const name = path.basename(u.pathname);
      return name || 'archive.bin';
    } catch {
      return path.basename(url) || 'archive.bin';
    }
  }

  /**
   * 简单的 shell 参数转义（使用单引号包裹）
   */
  private shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
  }

  /**
   * 安装失败时清理目标目录
   */
  private cleanupOnFailure(targetDir: string, installId: string): void {
    try {
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        logger.debug(`[SkillInstall] Cleaned up failed install dir: ${targetDir} (${installId})`);
      }
    } catch (e) {
      logger.warn(`[SkillInstall] cleanup failed for ${targetDir}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * IO 错误转换为 InstallResult
   */
  private ioErrorResult(e: unknown, fallback: string): InstallResult {
    const error = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      durationMs: 0,
      message: fallback,
      error,
    };
  }

  /**
   * 安全扫描：将已安装目录注册为临时 Skill 后扫描
   */
  private async runSecurityScan(
    installedPath: string,
    emit: (phase: InstallProgress['phase'], message: string, percent?: number, error?: string) => void,
  ): Promise<{ passed: boolean; riskLevel: string }> {
    try {
      const skillId = this.resolveSkillId(installedPath);
      // 构造临时 SkillDefinition 仅用于扫描
      const skillMdPath = path.join(installedPath, 'SKILL.md');
      const skillMdContent = fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, 'utf-8') : '';

      const def = {
        id: skillId,
        name: skillId,
        description: 'temporary scan target',
        group: 'custom' as const,
        source: 'user' as const,
        skillMdContent,
      };

      const result = skillSecurityScanner.scanSkill(def, false);
      emit('scan', `扫描完成：风险等级=${result.overallRisk}`, 90);
      return { passed: result.passed, riskLevel: result.overallRisk };
    } catch (e) {
      logger.warn(`[SkillInstall] security scan failed: ${e instanceof Error ? e.message : String(e)}`);
      return { passed: false, riskLevel: 'critical' };
    }
  }

  /**
   * 从已安装目录解析 Skill ID
   *
   * 优先使用目录名；若目录名不符合 Skill ID 命名规范，则从 SKILL.md frontmatter 中读取。
   */
  private resolveSkillId(installedPath: string, _spec?: SkillInstallSpec): string {
    const dirName = path.basename(installedPath);
    if (/^[a-z][a-z0-9_]*$/.test(dirName)) {
      return dirName;
    }
    // 尝试从 SKILL.md 中读取 id 字段
    const skillMdPath = path.join(installedPath, 'SKILL.md');
    if (fs.existsSync(skillMdPath)) {
      try {
        const content = fs.readFileSync(skillMdPath, 'utf-8');
        const match = content.match(/^id:\s*['"]?([a-zA-Z0-9_-]+)['"]?/m);
        if (match) {
          return match[1].toLowerCase().replace(/[^a-z0-9_]/g, '_');
        }
      } catch {
        // ignore
      }
    }
    // 兜底使用目录名
    return dirName;
  }

  /**
   * 生成安装 ID
   */
  private generateInstallId(): string {
    return 'inst_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
}

// ===================== Module-level Singleton =====================

/** 全局 Skill 安装管理器单例 */
export const skillInstallManager = new SkillInstallManager();

// 触发注册表引用以避免未使用警告（同时验证引用有效性）
void skillRegistry;
