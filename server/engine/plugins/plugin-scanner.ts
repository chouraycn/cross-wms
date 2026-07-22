/**
 * Plugin Scanner — 插件扫描器
 *
 * 扫描文件系统发现可用插件。
 * 与 ./discovery.ts 互补：
 * - discovery.ts 是 OpenClaw 移植的发现逻辑
 * - 本文件提供 SDK 层的扫描接口，支持目录扫描、manifest 读取、缓存
 *
 * 与 ./bundled-plugin-scan.ts 互补：
 * - bundled-plugin-scan.ts 关注内置插件
 * - 本文件关注文件系统插件扫描
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger.js';
import type { PluginManifest } from './types.js';
import { normalizePluginManifest } from './plugin-manifest.js';

/** 扫描选项 */
export interface PluginScanOptions {
  /** 扫描根目录 */
  rootDir: string;
  /** 是否递归扫描 */
  recursive?: boolean;
  /** 最大递归深度 */
  maxDepth?: number;
  /** manifest 文件名（默认 manifest.json） */
  manifestFileName?: string;
  /** 是否包含禁用的插件 */
  includeDisabled?: boolean;
  /** 排除的目录名 */
  excludeDirs?: string[];
}

/** 扫描结果项 */
export interface PluginScanResultEntry {
  /** 插件 ID */
  pluginId: string;
  /** 插件目录 */
  dir: string;
  /** manifest 路径 */
  manifestPath: string;
  /** manifest */
  manifest: PluginManifest;
  /** 是否有效 */
  valid: boolean;
  /** 校验错误 */
  errors?: string[];
}

/** 扫描结果 */
export interface PluginScanResult {
  /** 扫描的根目录 */
  rootDir: string;
  /** 发现的插件列表 */
  plugins: PluginScanResultEntry[];
  /** 扫描的目录数 */
  scannedDirs: number;
  /** 扫描耗时（毫秒） */
  durationMs: number;
  /** 错误列表 */
  errors: string[];
}

const DEFAULT_OPTIONS = {
  recursive: true,
  maxDepth: 3,
  manifestFileName: 'manifest.json',
  includeDisabled: false,
  excludeDirs: ['node_modules', '.git', 'dist', 'build', '__tests__'],
};

/** 扫描插件目录 */
export async function scanPlugins(options: PluginScanOptions): Promise<PluginScanResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  const plugins: PluginScanResultEntry[] = [];
  const errors: string[] = [];
  let scannedDirs = 0;

  logger.info(`[PluginScanner] 开始扫描: ${opts.rootDir}`);

  if (!fs.existsSync(opts.rootDir)) {
    return {
      rootDir: opts.rootDir,
      plugins: [],
      scannedDirs: 0,
      durationMs: Date.now() - startTime,
      errors: [`根目录不存在: ${opts.rootDir}`],
    };
  }

  await scanDir(opts.rootDir, opts, 0, plugins, errors, (count) => { scannedDirs = count; });

  logger.info(`[PluginScanner] 扫描完成: 发现 ${plugins.length} 个插件 (${Date.now() - startTime}ms)`);

  return {
    rootDir: opts.rootDir,
    plugins,
    scannedDirs,
    durationMs: Date.now() - startTime,
    errors,
  };
}

/** 递归扫描目录 */
async function scanDir(
  dir: string,
  opts: Required<Omit<PluginScanOptions, 'rootDir'>> & { rootDir: string },
  depth: number,
  plugins: PluginScanResultEntry[],
  errors: string[],
  updateCount: (count: number) => void,
  scannedCount = { value: 0 },
): Promise<void> {
  if (depth > opts.maxDepth) return;

  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    errors.push(`无法读取目录 ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  scannedCount.value++;
  updateCount(scannedCount.value);

  // 检查当前目录是否有 manifest
  const manifestPath = path.join(dir, opts.manifestFileName);
  if (fs.existsSync(manifestPath)) {
    const entry = await readPluginFromDir(dir, manifestPath, opts);
    if (entry) {
      plugins.push(entry);
    }
    return; // 找到 manifest 后不再递归
  }

  // 递归扫描子目录
  if (opts.recursive) {
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (opts.excludeDirs.includes(entry.name)) continue;
      const childDir = path.join(dir, entry.name);
      await scanDir(childDir, opts, depth + 1, plugins, errors, updateCount, scannedCount);
    }
  }
}

/** 从目录读取插件 */
async function readPluginFromDir(
  dir: string,
  manifestPath: string,
  opts: Required<Omit<PluginScanOptions, 'rootDir'>> & { rootDir: string },
): Promise<PluginScanResultEntry | null> {
  try {
    const content = await fs.promises.readFile(manifestPath, 'utf-8');
    const raw = JSON.parse(content) as Partial<PluginManifest>;
    const manifest = normalizePluginManifest(raw as PluginManifest);

    // 检查是否禁用
    if (!opts.includeDisabled && manifest.metadata?.disabled === true) {
      return null;
    }

    return {
      pluginId: manifest.id,
      dir,
      manifestPath,
      manifest,
      valid: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`[PluginScanner] 读取 manifest 失败: ${manifestPath} - ${message}`);
    return {
      pluginId: path.basename(dir),
      dir,
      manifestPath,
      manifest: normalizePluginManifest({
        id: path.basename(dir),
        name: path.basename(dir),
        version: '0.0.0',
      } as PluginManifest),
      valid: false,
      errors: [message],
    };
  }
}

/** 扫描单个插件目录 */
export async function scanSinglePlugin(dir: string, manifestFileName = 'manifest.json'): Promise<PluginScanResultEntry | null> {
  const manifestPath = path.join(dir, manifestFileName);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  return readPluginFromDir(dir, manifestPath, {
    rootDir: dir,
    recursive: false,
    maxDepth: 0,
    manifestFileName,
    includeDisabled: true,
    excludeDirs: [],
  });
}

/** 扫描多个根目录 */
export async function scanMultipleRoots(rootDirs: string[], options?: Omit<PluginScanOptions, 'rootDir'>): Promise<PluginScanResult[]> {
  const results: PluginScanResult[] = [];
  for (const rootDir of rootDirs) {
    const result = await scanPlugins({ ...options, rootDir });
    results.push(result);
  }
  return results;
}

/** 获取扫描结果的摘要 */
export function getScanSummary(result: PluginScanResult): string {
  const lines: string[] = [
    `Plugin Scan Summary`,
    `  Root: ${result.rootDir}`,
    `  Scanned dirs: ${result.scannedDirs}`,
    `  Found: ${result.plugins.length} plugins`,
    `  Valid: ${result.plugins.filter((p) => p.valid).length}`,
    `  Invalid: ${result.plugins.filter((p) => !p.valid).length}`,
    `  Duration: ${result.durationMs}ms`,
  ];
  if (result.errors.length > 0) {
    lines.push(`  Errors:`);
    for (const err of result.errors) {
      lines.push(`    - ${err}`);
    }
  }
  return lines.join('\n');
}
