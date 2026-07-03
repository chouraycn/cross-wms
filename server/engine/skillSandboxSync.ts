/**
 * Skill Sandbox Syncer — 技能沙箱同步
 *
 * 将 skill 文件同步到沙箱目录，含路径逃逸防护和重名处理。
 *
 * 功能：
 * - 同步多个 skill 源目录到沙箱
 * - 路径逃逸防护（防止 ../ 等路径遍历攻击）
 * - 重名处理（追加 -2、-3...）
 * - 支持过滤、忽略模式、进度回调
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 同步选项 */
export interface SyncOptions {
  /** 同步前清空目标目录 */
  clean?: boolean;
  /** 过滤哪些 skill 同步 */
  filter?: (skillName: string) => boolean;
  /** 忽略的文件/目录模式 */
  ignorePatterns?: string[];
  /** 进度回调 */
  onProgress?: (skillName: string, index: number, total: number) => void;
}

/** 同步结果 */
export interface SyncResult {
  /** 成功同步的数量 */
  synced: number;
  /** 跳过的数量 */
  skipped: number;
  /** 失败的列表 */
  failed: Array<{ name: string; error: string }>;
  /** 目标目录 */
  targetDir: string;
}

// ===================== 常量 =====================

/** 默认沙箱目录 */
const DEFAULT_SANDBOX_DIR = path.join(os.homedir(), '.workbuddy', 'skill-sandbox');

/** 默认忽略模式 */
const DEFAULT_IGNORE_PATTERNS = ['.git', 'node_modules', 'dist', '.venv', '__pycache__'];

// ===================== SkillSandboxSyncer 类 =====================

/**
 * 技能沙箱同步器
 *
 * 将 skill 文件同步到沙箱目录，确保路径安全，处理重名。
 */
export class SkillSandboxSyncer {
  /** 沙箱根目录 */
  private sandboxRoot: string;

  /**
   * 构造函数
   *
   * @param sandboxRoot - 沙箱根目录
   */
  constructor(sandboxRoot: string = DEFAULT_SANDBOX_DIR) {
    this.sandboxRoot = path.resolve(sandboxRoot);
    logger.info(`[SkillSandboxSyncer] Initialized with sandbox root: ${this.sandboxRoot}`);
  }

  /**
   * 同步多个 skill 目录到沙箱
   *
   * @param skillDirs - skill 源目录列表
   * @param options - 同步选项
   * @returns 同步结果
   */
  async syncSkills(skillDirs: string[], options?: SyncOptions): Promise<SyncResult> {
    const { clean = false, filter, ignorePatterns, onProgress } = options || {};

    const result: SyncResult = {
      synced: 0,
      skipped: 0,
      failed: [],
      targetDir: this.sandboxRoot,
    };

    logger.info(
      `[SkillSandboxSyncer] Starting sync: ${skillDirs.length} dir(s), clean=${clean}`
    );

    // 确保沙箱目录存在
    this.ensureDir(this.sandboxRoot);

    // 如果 clean 为 true，清空目标目录
    if (clean) {
      this.cleanSandbox();
    }

    // 收集所有 skill 目录
    const allSkills: Array<{ sourceDir: string; skillName: string }> = [];

    for (const dir of skillDirs) {
      const resolvedDir = path.resolve(dir);
      if (!fs.existsSync(resolvedDir)) {
        logger.warn(`[SkillSandboxSyncer] Source directory not found, skipping: ${resolvedDir}`);
        continue;
      }

      try {
        const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillDir = path.join(resolvedDir, entry.name);
            const skillMdPath = path.join(skillDir, 'SKILL.md');
            if (fs.existsSync(skillMdPath)) {
              allSkills.push({ sourceDir: skillDir, skillName: entry.name });
            }
          }
        }
      } catch (error) {
        logger.error(`[SkillSandboxSyncer] Failed to read directory ${resolvedDir}:`, error);
      }
    }

    logger.info(`[SkillSandboxSyncer] Found ${allSkills.length} skill(s) to process`);

    // 处理重名
    const existingNames = new Set<string>();
    const finalIgnorePatterns = ignorePatterns || DEFAULT_IGNORE_PATTERNS;

    for (let i = 0; i < allSkills.length; i++) {
      const { sourceDir, skillName } = allSkills[i];

      try {
        // 应用过滤
        if (filter && !filter(skillName)) {
          result.skipped++;
          logger.debug(`[SkillSandboxSyncer] Skill filtered out: ${skillName}`);
          if (onProgress) {
            onProgress(skillName, i + 1, allSkills.length);
          }
          continue;
        }

        // 解析唯一名称
        const uniqueName = this.resolveUniqueName(skillName, existingNames);
        existingNames.add(uniqueName);

        // 同步单个 skill
        const targetPath = await this.syncSingleSkill(sourceDir, uniqueName, finalIgnorePatterns);
        result.synced++;

        logger.debug(`[SkillSandboxSyncer] Synced skill: ${skillName} -> ${uniqueName}`);

        if (onProgress) {
          onProgress(skillName, i + 1, allSkills.length);
        }
      } catch (error) {
        result.failed.push({
          name: skillName,
          error: error instanceof Error ? error.message : String(error),
        });
        logger.error(`[SkillSandboxSyncer] Failed to sync skill '${skillName}':`, error);

        if (onProgress) {
          onProgress(skillName, i + 1, allSkills.length);
        }
      }
    }

    logger.info(
      `[SkillSandboxSyncer] Sync complete: synced=${result.synced}, ` +
      `skipped=${result.skipped}, failed=${result.failed.length}`
    );

    return result;
  }

  /**
   * 解析沙箱路径（带逃逸防护）
   *
   * 确保解析后的路径在 sandboxRoot 内，防止路径遍历攻击。
   *
   * @param skillName - 技能名称
   * @param sourcePath - 源路径
   * @returns 安全的沙箱内路径
   * @throws 如果路径逃逸则抛出错误
   */
  resolveSandboxPath(skillName: string, sourcePath: string): string {
    const skillDir = path.join(this.sandboxRoot, skillName);
    const resolved = path.resolve(skillDir, sourcePath);

    // 路径逃逸防护
    const normalizedRoot = path.resolve(this.sandboxRoot) + path.sep;
    const normalizedResolved = resolved + path.sep;

    if (!normalizedResolved.startsWith(normalizedRoot)) {
      logger.warn(
        `[SkillSandboxSyncer] Path escape attempt detected: ` +
        `skillName=${skillName}, sourcePath=${sourcePath}, resolved=${resolved}`
      );
      throw new Error(`Path escape detected: '${sourcePath}' is outside sandbox.`);
    }

    return resolved;
  }

  /**
   * 同步单个 skill 目录
   *
   * @param sourceDir - 源 skill 目录
   * @param targetName - 目标名称（可选，默认使用源目录名）
   * @param ignorePatterns - 忽略模式（可选）
   * @returns 复制后的目标路径
   */
  async syncSingleSkill(
    sourceDir: string,
    targetName?: string,
    ignorePatterns?: string[],
  ): Promise<string> {
    const resolvedSource = path.resolve(sourceDir);
    const name = targetName || path.basename(resolvedSource);

    const targetDir = path.join(this.sandboxRoot, name);

    // 确保目标目录在沙箱内
    const normalizedRoot = path.resolve(this.sandboxRoot) + path.sep;
    const normalizedTarget = targetDir + path.sep;
    if (!normalizedTarget.startsWith(normalizedRoot)) {
      throw new Error(`Target directory '${targetDir}' is outside sandbox.`);
    }

    // 清理旧目录（如果存在）
    if (fs.existsSync(targetDir)) {
      this.removeDir(targetDir);
    }

    // 创建目标目录
    this.ensureDir(targetDir);

    // 复制文件
    const patterns = ignorePatterns || DEFAULT_IGNORE_PATTERNS;
    this.copyDir(resolvedSource, targetDir, patterns);

    logger.debug(`[SkillSandboxSyncer] Single skill synced: ${resolvedSource} -> ${targetDir}`);

    return targetDir;
  }

  // ===================== 辅助方法 =====================

  /**
   * 解析唯一名称
   *
   * 如果 name 已存在，尝试 name-2, name-3... 直到找到唯一的。
   *
   * @param name - 原始名称
   * @param existing - 已存在的名称集合
   * @returns 唯一名称
   */
  resolveUniqueName(name: string, existing: Set<string>): string {
    if (!existing.has(name)) {
      return name;
    }

    let counter = 2;
    let uniqueName = `${name}-${counter}`;

    while (existing.has(uniqueName)) {
      counter++;
      uniqueName = `${name}-${counter}`;
    }

    logger.debug(
      `[SkillSandboxSyncer] Resolved unique name: '${name}' -> '${uniqueName}'`
    );

    return uniqueName;
  }

  /**
   * 确保目录存在
   */
  private ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * 清空沙箱目录
   */
  private cleanSandbox(): void {
    logger.info(`[SkillSandboxSyncer] Cleaning sandbox directory: ${this.sandboxRoot}`);
    if (fs.existsSync(this.sandboxRoot)) {
      const entries = fs.readdirSync(this.sandboxRoot);
      for (const entry of entries) {
        const fullPath = path.join(this.sandboxRoot, entry);
        this.removeDir(fullPath);
      }
    }
    logger.info('[SkillSandboxSyncer] Sandbox cleaned successfully');
  }

  /**
   * 递归删除目录
   */
  private removeDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      return;
    }

    const stat = fs.statSync(dir);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        this.removeDir(path.join(dir, entry));
      }
      fs.rmdirSync(dir);
    } else {
      fs.unlinkSync(dir);
    }
  }

  /**
   * 递归复制目录
   */
  private copyDir(src: string, dest: string, ignorePatterns: string[]): void {
    if (!fs.existsSync(src)) {
      return;
    }

    this.ensureDir(dest);

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      // 检查是否匹配忽略模式
      if (this.shouldIgnore(entry.name, ignorePatterns)) {
        continue;
      }

      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      // 再次检查目标路径是否在沙箱内
      const normalizedRoot = path.resolve(this.sandboxRoot) + path.sep;
      const normalizedDest = path.resolve(destPath) + path.sep;
      if (!normalizedDest.startsWith(normalizedRoot)) {
        logger.warn(`[SkillSandboxSyncer] Skipping path outside sandbox: ${destPath}`);
        continue;
      }

      if (entry.isDirectory()) {
        this.copyDir(srcPath, destPath, ignorePatterns);
      } else if (entry.isFile()) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * 检查文件/目录名是否应该被忽略
   */
  private shouldIgnore(name: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      if (name === pattern) {
        return true;
      }
      // 简单的通配符支持（* 前缀/后缀）
      if (pattern.startsWith('*') && name.endsWith(pattern.slice(1))) {
        return true;
      }
      if (pattern.endsWith('*') && name.startsWith(pattern.slice(0, -1))) {
        return true;
      }
    }
    return false;
  }
}

// ===================== Module-level Singleton =====================

/** 技能沙箱同步器单例（使用默认沙箱目录） */
export const skillSandboxSyncer = new SkillSandboxSyncer();
