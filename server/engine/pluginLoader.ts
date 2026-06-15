/**
 * Plugin Loader — 插件加载器
 *
 * v3.0: 负责解压 .zip 插件包、校验 plugin.json 清单、安装到文件系统并写入 DB。
 * 使用 fflate（已安装）进行 zip 解压。
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { unzipSync } from 'fflate';
import { validateManifest, type PluginManifest } from '../../shared/pluginManifest.js';
import { createPlugin, getPluginByName } from '../dao/plugins.js';
import type { PluginRow } from '../db.js';

/** 插件安装根目录 */
const PLUGINS_ROOT = path.join(os.homedir(), '.cdf-know-claw', 'plugins');

/** 确保插件根目录存在 */
function ensurePluginsRoot(): void {
  if (!fs.existsSync(PLUGINS_ROOT)) {
    fs.mkdirSync(PLUGINS_ROOT, { recursive: true });
  }
}

/**
 * 解压 .zip 插件包到指定目标目录。
 * 使用 fflate 的 unzipSync 进行解压。
 *
 * @param zipPath - .zip 文件的绝对路径
 * @param destDir - 解压目标目录的绝对路径
 * @throws 如果解压失败
 */
export function extractPlugin(zipPath: string, destDir: string): void {
  if (!fs.existsSync(zipPath)) {
    throw new Error(`插件包不存在: ${zipPath}`);
  }

  // 确保目标目录存在
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  try {
    const zipBuffer = fs.readFileSync(zipPath);
    const unzipped = unzipSync(zipBuffer);

    for (const [relativePath, fileData] of Object.entries(unzipped)) {
      // 跳过 macOS __MACOSX 目录和隐藏文件
      if (relativePath.startsWith('__MACOSX') || relativePath.includes('/__MACOSX')) {
        continue;
      }
      if (path.basename(relativePath).startsWith('.')) {
        continue;
      }

      const targetPath = path.join(destDir, relativePath);

      // fflate 的目录条目通常为空 Buffer
      if (fileData.length === 0 && relativePath.endsWith('/')) {
        if (!fs.existsSync(targetPath)) {
          fs.mkdirSync(targetPath, { recursive: true });
        }
      } else {
        // 确保父目录存在
        const parentDir = path.dirname(targetPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(targetPath, fileData);
      }
    }
  } catch (e) {
    // fflate 解压失败，尝试系统 unzip 命令
    try {
      execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { encoding: 'utf8', timeout: 30000 });
    } catch (unzipErr) {
      throw new Error(
        `插件解压失败: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
}

/**
 * 读取并校验 plugin.json 清单文件。
 *
 * @param manifestPath - plugin.json 文件的绝对路径
 * @returns 校验通过的 PluginManifest 对象
 * @throws 如果文件不存在或校验失败
 */
export function validateManifestFile(manifestPath: string): PluginManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`插件清单文件不存在: ${manifestPath}`);
  }

  let rawJson: string;
  try {
    rawJson = fs.readFileSync(manifestPath, 'utf-8');
  } catch (e) {
    throw new Error(`无法读取插件清单: ${e instanceof Error ? e.message : String(e)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (e) {
    throw new Error(`插件清单 JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    return validateManifest(parsed);
  } catch (e) {
    const zodError = e as { errors?: Array<{ message: string; path?: (string | number)[] }> };
    if (zodError.errors && Array.isArray(zodError.errors)) {
      const details = zodError.errors
        .map((err) => `${err.path?.join('.') || ''}: ${err.message}`)
        .join('; ');
      throw new Error(`插件清单校验失败: ${details}`);
    }
    throw new Error(`插件清单校验失败: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * 计算目录总大小（字节）
 */
function calcDirSize(dirPath: string): number {
  let totalSize = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      totalSize += calcDirSize(fullPath);
    } else if (entry.isFile()) {
      try {
        totalSize += fs.statSync(fullPath).size;
      } catch {
        // 忽略无法访问的文件
      }
    }
  }
  return totalSize;
}

/**
 * 编排插件安装流程：解压 → 校验 → 写入 DB。
 *
 * @param zipPath - .zip 插件包的绝对路径
 * @returns 新创建的 PluginRow 记录
 * @throws 如果安装过程中出现错误
 */
export async function installPlugin(zipPath: string): Promise<PluginRow> {
  ensurePluginsRoot();

  // 1. 解压到临时目录（先校验 manifest 再决定最终目录）
  const tmpDir = path.join(PLUGINS_ROOT, `.tmp-${Date.now()}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    extractPlugin(zipPath, tmpDir);

    // 2. 查找 plugin.json（可能在根目录或子目录中）
    let manifestPath = path.join(tmpDir, 'plugin.json');
    let pluginBaseDir = tmpDir;

    if (!fs.existsSync(manifestPath)) {
      // 在子目录中查找
      const subDirs = fs.readdirSync(tmpDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);

      for (const subDir of subDirs) {
        const candidate = path.join(tmpDir, subDir, 'plugin.json');
        if (fs.existsSync(candidate)) {
          manifestPath = candidate;
          pluginBaseDir = path.join(tmpDir, subDir);
          break;
        }
      }
    }

    // 3. 校验 manifest
    const manifest = validateManifestFile(manifestPath);

    // 4. 检查同名插件是否已安装
    const existing = getPluginByName(manifest.name);
    if (existing && existing.status !== 'uninstalled') {
      throw new Error(`插件 '${manifest.name}' 已存在（ID: ${existing.id}），请先卸载后再安装`);
    }

    // 5. 移动到最终安装目录
    const installDir = path.join(PLUGINS_ROOT, manifest.id);
    if (fs.existsSync(installDir)) {
      // 清理旧安装
      fs.rmSync(installDir, { recursive: true, force: true });
    }
    fs.renameSync(pluginBaseDir, installDir);

    // 清理临时目录
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // 忽略临时目录清理失败
    }

    // 6. 计算插件大小
    const sizeBytes = calcDirSize(installDir);

    // 7. 写入 DB
    const pluginRow = createPlugin({
      name: manifest.name,
      display_name: manifest.displayName || manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      icon: manifest.icon,
      manifest_json: JSON.stringify(manifest),
      entry_path: manifest.entry,
      install_path: installDir,
      trigger_keywords: JSON.stringify(manifest.triggers),
      permissions: JSON.stringify(manifest.permissions),
      risk_level: manifest.riskLevel,
      size_bytes: sizeBytes,
      metadata: JSON.stringify(manifest.metadata),
    });

    return pluginRow;
  } catch (e) {
    // 安装失败，清理临时目录
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // 忽略清理失败
    }
    throw e;
  }
}
