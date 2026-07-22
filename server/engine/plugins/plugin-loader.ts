/**
 * Plugin SDK 加载器 — 动态插件加载
 *
 * 与现有 ./loader.ts 与 server/engine/pluginLoader.ts 的关系：
 * - ./loader.ts 提供纯逻辑工具（版本解析、依赖拓扑、加载顺序）
 * - server/engine/pluginLoader.ts 提供 IO 层加载（fs.readdir / dynamic import）
 * - 本文件提供 SDK 层加载编排，组合 manifest 校验 + 沙箱初始化 + 注册表更新
 */

import path from 'node:path';
import { logger } from '../../logger.js';
import type { PluginManifest, PluginInstance } from './types.js';
import {
  validatePluginManifest,
  normalizePluginManifest,
  assertValidManifest,
} from './plugin-manifest.js';
import {
  computeLoadOrder,
  resolveDependencyTree,
  type PluginLoadOrderNode,
  type DependencyResolutionResult,
} from './loader.js';
import { pluginRuntimeRegistry } from './registry.js';
import { initializePluginSandbox, executeInPluginSandbox } from './plugin-sandbox.js';
import { initializePluginPermissions } from './plugin-permissions.js';
import { createPluginContext, destroyPluginContext } from './plugin-context.js';
import { emitPluginError } from './plugin-events.js';
import {
  PluginLoadError,
  PluginManifestError,
  PluginDependencyError,
  toPluginSdkError,
} from './plugin-errors.js';
import { EVENT_PLUGIN_LOADED } from './plugin-constants.js';
import { getGlobalEventBus } from './plugin-events.js';

// ===================== 加载结果 =====================

/** 单个插件加载结果 */
export interface PluginLoadResult {
  pluginId: string;
  ok: boolean;
  manifest?: PluginManifest;
  module?: unknown;
  error?: string;
  durationMs: number;
}

/** 批量加载结果 */
export interface PluginBatchLoadResult {
  results: PluginLoadResult[];
  order: PluginLoadOrderNode[];
  resolution: DependencyResolutionResult;
  totalOk: number;
  totalFailed: number;
}

// ===================== 单插件加载 =====================

/** 加载选项 */
export interface LoadPluginOptions {
  /** 是否跳过权限初始化（用于 discovery 模式） */
  skipPermissions?: boolean;
  /** 是否跳过沙箱初始化（用于已确认安全的内置插件） */
  skipSandbox?: boolean;
  /** 是否自动注册到运行时注册表 */
  autoRegister?: boolean;
  /** 注册模式 */
  registrationMode?: 'full' | 'discovery' | 'cli-metadata' | 'tool-discovery';
}

/** 动态加载插件模块 */
export async function loadPluginModule(
  installPath: string,
  entryPath: string,
  pluginId: string,
): Promise<unknown> {
  const fullPath = path.resolve(installPath, entryPath);
  try {
    // 使用动态 import 实现懒加载
    const module = await import(fullPath);
    // 兼容 default export 与 named export
    return module.default ?? module;
  } catch (err) {
    throw new PluginLoadError(
      `加载插件 ${pluginId} 入口失败: ${err instanceof Error ? err.message : String(err)}`,
      pluginId,
      fullPath,
      err,
    );
  }
}

/** 加载单个插件（manifest → 校验 → 加载模块 → 初始化） */
export async function loadPluginEntry(
  manifestRaw: unknown,
  installPath: string,
  options: LoadPluginOptions = {},
): Promise<PluginLoadResult> {
  const startTime = Date.now();
  const { skipPermissions = false, skipSandbox = false, autoRegister = true } = options;

  let manifest: PluginManifest;
  try {
    // 1. 校验与规范化 manifest
    assertValidManifest(manifestRaw);
    manifest = normalizePluginManifest(manifestRaw);
  } catch (err) {
    const error = err instanceof PluginManifestError
      ? err
      : toPluginSdkError(err);
    emitPluginError((manifestRaw as { id?: string })?.id ?? 'unknown', error);
    return {
      pluginId: (manifestRaw as { id?: string })?.id ?? 'unknown',
      ok: false,
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }

  const pluginId = manifest.id;

  try {
    // 2. 初始化沙箱（除非跳过）
    if (!skipSandbox) {
      initializePluginSandbox(manifest);
    }

    // 3. 初始化权限（除非跳过）
    if (!skipPermissions) {
      initializePluginPermissions(pluginId, manifest, { autoGrantLowRisk: true });
    }

    // 4. 动态加载入口模块
    const entryPath = manifest.entry ?? 'index.js';
    const module = await loadPluginModule(installPath, entryPath, pluginId);

    // 5. 创建上下文
    const context = createPluginContext({ manifest });

    // 6. 调用 register（如果模块提供）
    if (module && typeof module === 'object' && 'register' in module) {
      const registerFn = (module as { register?: (ctx: unknown) => unknown }).register;
      if (typeof registerFn === 'function') {
        await executeInPluginSandbox(manifest, () => registerFn(context));
      }
    }

    // 7. 注册到运行时注册表
    if (autoRegister) {
      const instance: PluginInstance = {
        id: pluginId,
        manifest,
        module,
        loadedAt: Date.now(),
        status: 'installed',
        capabilities: manifest.capabilities ?? [],
      };
      pluginRuntimeRegistry.register(instance);
    }

    // 8. 触发加载完成事件
    getGlobalEventBus().emit(EVENT_PLUGIN_LOADED, { pluginId, manifest, timestamp: Date.now() });

    logger.info(`[PluginLoader] 插件 ${pluginId}@${manifest.version} 加载成功`);

    return {
      pluginId,
      ok: true,
      manifest,
      module,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const error = toPluginSdkError(err, pluginId);
    emitPluginError(pluginId, error);
    logger.error(`[PluginLoader] 插件 ${pluginId} 加载失败: ${error.message}`);

    return {
      pluginId,
      ok: false,
      error: error.message,
      durationMs: Date.now() - startTime,
    };
  }
}

// ===================== 批量加载 =====================

/** 批量加载插件（按依赖拓扑顺序） */
export async function loadPluginsBatch(
  plugins: Array<{ manifest: unknown; installPath: string }>,
  options: LoadPluginOptions = {},
): Promise<PluginBatchLoadResult> {
  // 1. 校验所有 manifest
  const validated: Array<{ manifest: PluginManifest; installPath: string }> = [];
  for (const p of plugins) {
    try {
      assertValidManifest(p.manifest);
      validated.push({
        manifest: normalizePluginManifest(p.manifest),
        installPath: p.installPath,
      });
    } catch (err) {
      logger.warn(`[PluginLoader] 跳过无效 manifest: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. 解析依赖树
  const manifests = validated.map((v) => v.manifest);
  const available = new Map(validated.map((v) => [v.manifest.id, v.installPath]));
  const resolution = resolveDependencyTree(manifests, available);

  // 3. 使用解析结果的加载顺序（保留 PluginLoadOrderNode 信息）
  const order = resolution.order;

  // 4. 按顺序加载
  const results: PluginLoadResult[] = [];
  const manifestMap = new Map(validated.map((v) => [v.manifest.id, v]));

  for (const node of order) {
    const entry = manifestMap.get(node.pluginId);
    if (!entry) {
      results.push({
        pluginId: node.pluginId,
        ok: false,
        error: 'manifest 不在加载列表中',
        durationMs: 0,
      });
      continue;
    }

    if (node.skipped) {
      results.push({
        pluginId: node.pluginId,
        ok: false,
        error: node.skipReason ?? '被跳过',
        durationMs: 0,
      });
      continue;
    }

    // 检查依赖是否已成功加载
    const failedDeps = node.dependencies.filter((depId) => {
      const depResult = results.find((r) => r.pluginId === depId);
      return !depResult?.ok;
    });

    if (failedDeps.length > 0) {
      const missingDep = resolution.missing.find((m) => m.pluginId === node.pluginId);
      if (missingDep) {
        throw new PluginDependencyError(
          `插件 ${node.pluginId} 缺少依赖: ${missingDep.missing}`,
          missingDep.missing,
          node.pluginId,
        );
      }
      results.push({
        pluginId: node.pluginId,
        ok: false,
        error: `依赖未加载: ${failedDeps.join(', ')}`,
        durationMs: 0,
      });
      continue;
    }

    const result = await loadPluginEntry(entry.manifest, entry.installPath, options);
    results.push(result);
  }

  const totalOk = results.filter((r) => r.ok).length;
  const totalFailed = results.length - totalOk;

  logger.info(`[PluginLoader] 批量加载完成: ${totalOk} 成功, ${totalFailed} 失败`);

  return {
    results,
    order,
    resolution,
    totalOk,
    totalFailed,
  };
}

// ===================== 卸载 =====================

/** 卸载插件（清理上下文、注销注册、撤销权限） */
export async function unloadPluginEntry(pluginId: string): Promise<boolean> {
  const entry = pluginRuntimeRegistry.find(pluginId);
  if (!entry) {
    logger.warn(`[PluginLoader] 插件 ${pluginId} 未注册，无法卸载`);
    return false;
  }

  try {
    // 调用 unregister（如果模块提供）
    const module = entry.instance as { unregister?: (ctx: unknown) => unknown } | undefined;
    if (module?.unregister && typeof module.unregister === 'function') {
      const context = createPluginContext({ manifest: entry.manifest });
      await executeInPluginSandbox(entry.manifest, () => module.unregister!(context));
    }

    // 清理上下文
    destroyPluginContext(pluginId);

    // 注销
    pluginRuntimeRegistry.unregister(pluginId);

    logger.info(`[PluginLoader] 插件 ${pluginId} 卸载成功`);
    return true;
  } catch (err) {
    emitPluginError(pluginId, err);
    logger.error(`[PluginLoader] 插件 ${pluginId} 卸载失败: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// 重新导出底层 API
export {
  computeLoadOrder,
  resolveDependencyTree,
  validatePluginManifest,
  normalizePluginManifest,
};
export type { PluginLoadOrderNode, DependencyResolutionResult };
