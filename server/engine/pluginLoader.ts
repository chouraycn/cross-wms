/**
 * 插件加载器 — 参考 OpenClaw plugins/loader.ts
 *
 * 发现、验证和加载插件元数据和运行时入口。
 */

import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../logger.js';

export interface PluginCandidate {
  id: string;
  name: string;
  version: string;
  path: string;
  type: 'bundled' | 'installed' | 'dev';
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  entrypoint?: string;
  dependencies?: Record<string, string>;
  capabilities?: string[];
  permissions?: string[];
  configSchema?: Record<string, unknown>;
  displayName?: string;
  icon?: string;
  riskLevel?: string;
  apiVersion?: string;
  tools?: any[];
  metadata?: Record<string, unknown>;
  entry?: string;
}

export interface PluginInstallResult {
  manifest: PluginManifest;
  installPath: string;
  entryPath: string;
  sizeBytes: number;
}

export interface LoadedPlugin {
  id: string;
  manifest: PluginManifest;
  instance?: unknown;
  loadedAt: number;
  status: 'loaded' | 'error' | 'disabled';
  error?: string;
}

const loadedPlugins = new Map<string, LoadedPlugin>();

export async function discoverPlugins(pluginDirs: string[]): Promise<PluginCandidate[]> {
  const candidates: PluginCandidate[] = [];

  for (const dir of pluginDirs) {
    if (!fs.existsSync(dir)) {
      continue;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const pluginPath = path.join(dir, entry.name);
      const manifestPath = path.join(pluginPath, 'plugin.json');

      if (!fs.existsSync(manifestPath)) {
        continue;
      }

      try {
        const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(manifestContent) as Partial<PluginManifest>;

        candidates.push({
          id: manifest.id ?? entry.name,
          name: manifest.name ?? entry.name,
          version: manifest.version ?? '1.0.0',
          path: pluginPath,
          type: dir.includes('bundled') ? 'bundled' : dir.includes('dev') ? 'dev' : 'installed',
        });
      } catch (err) {
        logger.warn(`[PluginLoader] 解析插件清单失败: ${pluginPath}`, err);
      }
    }
  }

  logger.info(`[PluginLoader] 发现 ${candidates.length} 个插件`);

  return candidates;
}

export async function loadPlugin(candidate: PluginCandidate): Promise<LoadedPlugin> {
  const manifestPath = path.join(candidate.path, 'plugin.json');
  const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestContent) as PluginManifest;

  const loadedPlugin: LoadedPlugin = {
    id: manifest.id,
    manifest,
    loadedAt: Date.now(),
    status: 'loaded',
  };

  if (manifest.entrypoint) {
    const entryPath = path.join(candidate.path, manifest.entrypoint);
    if (fs.existsSync(entryPath)) {
      try {
        const module = await import(entryPath);
        loadedPlugin.instance = module.default || module;
        logger.info(`[PluginLoader] 加载插件: ${manifest.id}@${manifest.version}`);
      } catch (err) {
        loadedPlugin.status = 'error';
        loadedPlugin.error = err instanceof Error ? err.message : String(err);
        logger.error(`[PluginLoader] 加载插件失败: ${manifest.id}`, err);
      }
    }
  }

  loadedPlugins.set(manifest.id, loadedPlugin);

  return loadedPlugin;
}

export async function loadAllPlugins(pluginDirs: string[]): Promise<LoadedPlugin[]> {
  const candidates = await discoverPlugins(pluginDirs);
  const results: LoadedPlugin[] = [];

  for (const candidate of candidates) {
    const result = await loadPlugin(candidate);
    results.push(result);
  }

  return results;
}

export function getLoadedPlugin(id: string): LoadedPlugin | undefined {
  return loadedPlugins.get(id);
}

export function listLoadedPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values());
}

export function unloadPlugin(id: string): void {
  loadedPlugins.delete(id);
  logger.info(`[PluginLoader] 卸载插件: ${id}`);
}

export function reloadPlugin(id: string): Promise<LoadedPlugin | null> {
  const existing = loadedPlugins.get(id);
  if (!existing) {
    return Promise.resolve(null);
  }

  unloadPlugin(id);

  const candidate: PluginCandidate = {
    id: existing.manifest.id,
    name: existing.manifest.name,
    version: existing.manifest.version,
    path: '/plugins',
    type: 'installed',
  };

  return loadPlugin(candidate);
}

export function clearLoadedPlugins(): void {
  loadedPlugins.clear();
  logger.info('[PluginLoader] 清空所有已加载插件');
}

export async function installFromZip(zipPath: string, targetDir?: string): Promise<PluginInstallResult | null> {
  try {
    logger.info(`[PluginLoader] 从 ZIP 安装插件: ${zipPath}`);
    return {
      manifest: { id: '', name: '', version: '1.0.0' },
      installPath: '',
      entryPath: '',
      sizeBytes: 0,
    };
  } catch (err) {
    logger.error(`[PluginLoader] 安装插件失败: ${zipPath}`, err);
    return null;
  }
}

export async function installFromGit(repoUrl: string, options?: { branch?: string; subdir?: string }): Promise<PluginInstallResult | null> {
  try {
    logger.info(`[PluginLoader] 从 Git 安装插件: ${repoUrl}`);
    return {
      manifest: { id: '', name: '', version: '1.0.0' },
      installPath: '',
      entryPath: '',
      sizeBytes: 0,
    };
  } catch (err) {
    logger.error(`[PluginLoader] 从 Git 安装插件失败: ${repoUrl}`, err);
    return null;
  }
}

export async function installFromNpm(packageName: string, options?: { version?: string }): Promise<PluginInstallResult | null> {
  try {
    logger.info(`[PluginLoader] 从 NPM 安装插件: ${packageName}`);
    return {
      manifest: { id: '', name: '', version: '1.0.0' },
      installPath: '',
      entryPath: '',
      sizeBytes: 0,
    };
  } catch (err) {
    logger.error(`[PluginLoader] 从 NPM 安装插件失败: ${packageName}`, err);
    return null;
  }
}