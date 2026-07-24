/**
 * 技能沙箱隔离系统
 *
 * 参考 OpenClaw 的沙箱三件套：
 * 1. env-overrides.ts — 环境变量注入与净化（防止技能注入键泄漏到子进程）
 * 2. workspace.ts — 技能复制到沙箱工作区（symlink 安全处理）
 * 3. sandbox-paths.ts — 沙箱路径安全检查（防止路径逃逸）
 *
 * 安全核心：
 * - 技能注入的环境变量在子进程 spawn 时被剥离
 * - 危险变量（OPENSSL_CONF 等）永远屏蔽
 * - 技能目录复制到沙箱，避免 symlink 路径逃逸
 */

import path from "node:path";
import fs from "node:fs/promises";
import { getChildLogger } from "../../logging/logger.js";

const logger = getChildLogger({ module: "skill-sandbox" });

// ============================================================================
// 危险环境变量黑名单
// ============================================================================

/** 永远屏蔽的危险环境变量（不可被技能设置） */
const DANGEROUS_ENV_VARS = new Set([
  "OPENSSL_CONF",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_PATH",
  "PYTHONPATH",
  "PYTHONSTARTUP",
  "PERL5OPT",
  "RUBYOPT",
  "JAVA_TOOL_OPTIONS",
  "BASH_ENV",
  "ENV",
  "PS1",
]);

/** 需要验证前缀的敏感变量 */
const SENSITIVE_ENV_PREFIXES = [
  "API_KEY_",
  "SECRET_",
  "TOKEN_",
  "PASSWORD_",
  "CREDENTIAL_",
];

// ============================================================================
// 环境变量净化器
// ============================================================================

/** 环境变量净化结果 */
export interface SanitizedEnvResult {
  /** 净化后的环境变量 */
  sanitized: Record<string, string>;
  /** 被移除的变量及原因 */
  removed: Array<{ key: string; reason: string }>;
  /** 被替换的变量 */
  replaced: Array<{ key: string; oldValue: string; newValue: string }>;
}

/** 验证环境变量值是否安全 */
export function validateEnvVarValue(key: string, value: string): { valid: boolean; reason?: string } {
  // 检查危险变量
  if (DANGEROUS_ENV_VARS.has(key)) {
    return { valid: false, reason: `Variable "${key}" is in dangerous blocklist` };
  }

  // 检查路径注入
  if (value.includes("..") || value.includes("\0")) {
    return { valid: false, reason: `Variable "${key}" contains suspicious path pattern` };
  }

  // 检查命令注入模式
  const injectionPatterns = [
    /`[^`]*`/,         // 反引号命令替换
    /\$\([^)]*\)/,     // $(...) 命令替换
    /;\s*(rm|del|format|mkfs)/i,  // 危险命令链接
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(value)) {
      return { valid: false, reason: `Variable "${key}" contains potential command injection` };
    }
  }

  return { valid: true };
}

/** 净化环境变量（移除危险变量） */
export function sanitizeEnvVars(env: Record<string, string>): SanitizedEnvResult {
  const sanitized: Record<string, string> = {};
  const removed: Array<{ key: string; reason: string }> = [];
  const replaced: Array<{ key: string; oldValue: string; newValue: string }> = [];

  for (const [key, value] of Object.entries(env)) {
    // 检查危险变量
    if (DANGEROUS_ENV_VARS.has(key)) {
      removed.push({ key, reason: "Dangerous variable blocked" });
      continue;
    }

    // 验证值
    const validation = validateEnvVarValue(key, value);
    if (!validation.valid) {
      removed.push({ key, reason: validation.reason || "Invalid value" });
      continue;
    }

    sanitized[key] = value;
  }

  if (removed.length > 0) {
    logger.warn(`[Sandbox] Sanitized ${removed.length} dangerous env vars:`, removed.map((r) => r.key));
  }

  return { sanitized, removed, replaced };
}

// ============================================================================
// 沙箱路径安全
// ============================================================================

/** 检查路径是否在沙箱根目录内 */
export function isInsideSandbox(targetPath: string, sandboxRoot: string): boolean {
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(sandboxRoot);
  const relative = path.relative(resolvedRoot, resolvedTarget);

  // 如果相对路径以 .. 开头，说明在沙箱外
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

/** 断言路径在沙箱内（否则抛出异常） */
export function assertInsideSandbox(targetPath: string, sandboxRoot: string): void {
  if (!isInsideSandbox(targetPath, sandboxRoot)) {
    throw new Error(`Path escapes sandbox root: ${targetPath} (root: ${sandboxRoot})`);
  }
}

/** 解析沙箱路径 */
export function resolveSandboxPath(sandboxRoot: string, ...segments: string[]): string {
  const resolved = path.resolve(sandboxRoot, ...segments);
  assertInsideSandbox(resolved, sandboxRoot);
  return resolved;
}

// ============================================================================
// 工作区技能同步
// ============================================================================

/** 同步配置 */
export interface SyncConfig {
  /** 源目录（原始技能目录） */
  sourceDir: string;
  /** 目标目录（沙箱目录） */
  targetDir: string;
  /** 是否覆盖已存在的文件 */
  overwrite?: boolean;
  /** 要排除的文件模式 */
  excludePatterns?: string[];
}

/** 同步结果 */
export interface SyncResult {
  /** 同步的文件数量 */
  fileCount: number;
  /** 同步的目录数量 */
  dirCount: number;
  /** 跳过的文件 */
  skipped: string[];
  /** 错误列表 */
  errors: Array<{ file: string; error: string }>;
  /** 耗时（毫秒） */
  durationMs: number;
}

/** 将技能同步到沙箱工作区 */
export async function syncSkillToSandbox(config: SyncConfig): Promise<SyncResult> {
  const startTime = Date.now();
  const errors: Array<{ file: string; error: string }> = [];
  const skipped: string[] = [];
  let fileCount = 0;
  let dirCount = 0;

  try {
    // 确保目标目录存在
    await fs.mkdir(config.targetDir, { recursive: true });

    // 读取源目录
    const entries = await fs.readdir(config.sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(config.sourceDir, entry.name);
      const targetPath = path.join(config.targetDir, entry.name);

      // 检查排除模式
      if (config.excludePatterns?.some((pattern) => {
        const regex = new RegExp(pattern);
        return regex.test(entry.name);
      })) {
        skipped.push(entry.name);
        continue;
      }

      try {
        if (entry.isDirectory()) {
          // 递归同步子目录
          const subResult = await syncSkillToSandbox({
            sourceDir: sourcePath,
            targetDir: targetPath,
            overwrite: config.overwrite,
            excludePatterns: config.excludePatterns,
          });
          fileCount += subResult.fileCount;
          dirCount += subResult.dirCount + 1;
          errors.push(...subResult.errors);
          skipped.push(...subResult.skipped);
        } else if (entry.isFile()) {
          // 检查是否需要覆盖
          if (!config.overwrite) {
            try {
              await fs.access(targetPath);
              skipped.push(entry.name);
              continue;
            } catch {
              // 文件不存在，继续复制
            }
          }

          // 复制文件
          await fs.copyFile(sourcePath, targetPath);
          fileCount++;
        } else if (entry.isSymbolicLink()) {
          // 处理符号链接：解析真实路径并复制
          const realPath = await fs.realpath(sourcePath);
          const stat = await fs.stat(realPath);

          if (stat.isDirectory()) {
            // 对于 symlink 指向的目录，复制真实内容
            const subResult = await syncSkillToSandbox({
              sourceDir: realPath,
              targetDir: targetPath,
              overwrite: config.overwrite,
              excludePatterns: config.excludePatterns,
            });
            fileCount += subResult.fileCount;
            dirCount += subResult.dirCount + 1;
            errors.push(...subResult.errors);
            skipped.push(...subResult.skipped);
          } else {
            // 对于 symlink 指向的文件，复制真实内容
            if (!config.overwrite) {
              try {
                await fs.access(targetPath);
                skipped.push(entry.name);
                continue;
              } catch {
                // 文件不存在
              }
            }
            await fs.copyFile(realPath, targetPath);
            fileCount++;
          }
        }
      } catch (err) {
        errors.push({
          file: entry.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    errors.push({
      file: config.sourceDir,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const durationMs = Date.now() - startTime;
  logger.info(
    `[Sandbox] Sync complete: ${fileCount} files, ${dirCount} dirs, ${skipped.length} skipped, ${errors.length} errors (${durationMs}ms)`
  );

  return { fileCount, dirCount, skipped, errors, durationMs };
}

/** 清理沙箱目录 */
export async function cleanSandbox(sandboxDir: string): Promise<void> {
  try {
    await fs.rm(sandboxDir, { recursive: true, force: true });
    logger.info(`[Sandbox] Cleaned sandbox: ${sandboxDir}`);
  } catch (err) {
    logger.error(`[Sandbox] Failed to clean sandbox: ${err}`);
  }
}

/** 获取沙箱技能目录 */
export function getSandboxSkillsDir(sandboxRoot: string): string {
  return path.join(sandboxRoot, "sandbox-skills");
}

// ============================================================================
// 技能环境变量引用计数
// ============================================================================

/** 活跃技能环境变量追踪器 */
export class SkillEnvTracker {
  private activeEntries: Map<string, { refCount: number; skillName: string }> = new Map();

  /** 标记技能注入了环境变量 */
  track(skillName: string, envKey: string): void {
    const key = `${skillName}:${envKey}`;
    const existing = this.activeEntries.get(key);
    if (existing) {
      existing.refCount++;
    } else {
      this.activeEntries.set(key, { refCount: 1, skillName });
    }
  }

  /** 取消标记 */
  untrack(skillName: string, envKey: string): void {
    const key = `${skillName}:${envKey}`;
    const existing = this.activeEntries.get(key);
    if (existing) {
      existing.refCount--;
      if (existing.refCount <= 0) {
        this.activeEntries.delete(key);
      }
    }
  }

  /** 获取所有活跃的环境变量键 */
  getActiveEnvKeys(): string[] {
    const keys = new Set<string>();
    for (const [key] of this.activeEntries) {
      const envKey = key.split(":").slice(1).join(":");
      keys.add(envKey);
    }
    return Array.from(keys);
  }

  /** 获取技能注入的所有环境变量键 */
  getSkillEnvKeys(skillName: string): string[] {
    const keys: string[] = [];
    for (const [key, entry] of this.activeEntries) {
      if (entry.skillName === skillName) {
        const envKey = key.split(":").slice(1).join(":");
        keys.push(envKey);
      }
    }
    return keys;
  }

  /** 清除所有追踪 */
  clear(): void {
    this.activeEntries.clear();
  }
}

// ============================================================================
// 全局实例
// ============================================================================

let globalEnvTracker: SkillEnvTracker | null = null;

/** 获取全局环境变量追踪器 */
export function getSkillEnvTracker(): SkillEnvTracker {
  if (!globalEnvTracker) {
    globalEnvTracker = new SkillEnvTracker();
  }
  return globalEnvTracker;
}

/** 重置全局追踪器 */
export function resetSkillEnvTracker(): void {
  globalEnvTracker = null;
}