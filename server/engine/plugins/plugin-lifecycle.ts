/**
 * Plugin SDK 生命周期 — 安装/卸载/更新编排
 *
 * 与现有 ./lifecycle.ts 的关系：
 * - ./lifecycle.ts 提供状态机与底层钩子调用
 * - 本文件提供 SDK 层编排，组合 manifest + context + sandbox 执行生命周期钩子
 */

import { logger } from '../../logger.js';
import type { PluginManifest, PluginContext, PluginLifecycle } from './types.js';
import {
  assertTransition,
  invokeLifecycleHook,
  getLifecycleState,
  listLifecycleStates,
  type LifecycleState,
} from './lifecycle.js';
import { pluginRuntimeRegistry } from './registry.js';
import { createPluginContext, destroyPluginContext } from './plugin-context.js';
import { executeInPluginSandbox } from './plugin-sandbox.js';
import { initializePluginPermissions, revokeAllPluginPermissions } from './plugin-permissions.js';
import { initializePluginSandbox, cleanupPluginSandbox } from './plugin-sandbox.js';
import { emitPluginError } from './plugin-events.js';
import { getGlobalEventBus } from './plugin-events.js';
import {
  EVENT_PLUGIN_ACTIVATED,
  EVENT_PLUGIN_DEACTIVATED,
  EVENT_PLUGIN_UNINSTALLED,
  EVENT_PLUGIN_UPDATED,
} from './plugin-constants.js';
import {
  PluginLifecycleError,
  PluginSdkError,
  toPluginSdkError,
} from './plugin-errors.js';

// ===================== 生命周期操作结果 =====================

/** 生命周期操作结果 */
export interface LifecycleOperationResult {
  pluginId: string;
  ok: boolean;
  fromState: LifecycleState;
  toState: LifecycleState;
  error?: string;
  durationMs: number;
}

// ===================== 启用插件 =====================

/** 启用插件（installed → enabled） */
export async function activatePlugin(
  manifest: PluginManifest,
  config?: Record<string, unknown>,
): Promise<LifecycleOperationResult> {
  const startTime = Date.now();
  const pluginId = manifest.id;
  const fromState = getLifecycleState(pluginId);

  try {
    // 1. 状态迁移校验
    assertTransition(fromState, 'enabling');

    // 2. 初始化沙箱与权限
    initializePluginSandbox(manifest);
    initializePluginPermissions(pluginId, manifest, { autoGrantLowRisk: true });

    // 3. 创建上下文
    const context = createPluginContext({ manifest, config });

    // 4. 查找模块的 lifecycle 钩子
    const entry = pluginRuntimeRegistry.find(pluginId);
    const module = entry?.instance as { lifecycle?: PluginLifecycle } | undefined;
    const lifecycle = module?.lifecycle;

    // 5. 调用 enable 钩子
    if (lifecycle?.enable) {
      await executeInPluginSandbox(manifest, () => lifecycle.enable!(context));
    }

    // 6. 状态迁移到 enabled
    assertTransition(fromState, 'enabled');

    // 7. 触发事件
    getGlobalEventBus().emit(EVENT_PLUGIN_ACTIVATED, { pluginId, timestamp: Date.now() });

    logger.info(`[PluginLifecycle] 插件 ${pluginId} 已启用`);

    return {
      pluginId,
      ok: true,
      fromState,
      toState: 'enabled',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    emitPluginError(pluginId, err);
    logger.error(`[PluginLifecycle] 启用 ${pluginId} 失败: ${err instanceof Error ? err.message : String(err)}`);

    return {
      pluginId,
      ok: false,
      fromState,
      toState: getLifecycleState(pluginId),
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

// ===================== 禁用插件 =====================

/** 禁用插件（enabled → disabled） */
export async function deactivatePlugin(pluginId: string): Promise<LifecycleOperationResult> {
  const startTime = Date.now();
  const fromState = getLifecycleState(pluginId);

  try {
    assertTransition(fromState, 'disabling');

    const entry = pluginRuntimeRegistry.find(pluginId);
    if (!entry) {
      throw new PluginLifecycleError(
        `插件 ${pluginId} 未注册`,
        fromState,
        'disabling',
        pluginId,
      );
    }

    const context = createPluginContext({ manifest: entry.manifest });
    const module = entry.instance as { lifecycle?: PluginLifecycle } | undefined;
    const lifecycle = module?.lifecycle;

    if (lifecycle?.disable) {
      await executeInPluginSandbox(entry.manifest, () => lifecycle.disable!(context));
    }

    assertTransition(fromState, 'disabled');

    getGlobalEventBus().emit(EVENT_PLUGIN_DEACTIVATED, { pluginId, timestamp: Date.now() });

    logger.info(`[PluginLifecycle] 插件 ${pluginId} 已禁用`);

    return {
      pluginId,
      ok: true,
      fromState,
      toState: 'disabled',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    emitPluginError(pluginId, err);
    logger.error(`[PluginLifecycle] 禁用 ${pluginId} 失败: ${err instanceof Error ? err.message : String(err)}`);

    return {
      pluginId,
      ok: false,
      fromState,
      toState: getLifecycleState(pluginId),
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

// ===================== 安装插件 =====================

/** 安装插件（首次注册 manifest + 调用 install 钩子） */
export async function installPluginEntry(
  manifest: PluginManifest,
  config?: Record<string, unknown>,
): Promise<LifecycleOperationResult> {
  const startTime = Date.now();
  const pluginId = manifest.id;
  const fromState = getLifecycleState(pluginId);

  try {
    // 1. 初始化沙箱与权限
    initializePluginSandbox(manifest);
    initializePluginPermissions(pluginId, manifest, { autoGrantLowRisk: true });

    // 2. 创建上下文
    const context = createPluginContext({ manifest, config });

    // 3. 调用 install 钩子（如果模块已加载）
    const entry = pluginRuntimeRegistry.find(pluginId);
    const module = entry?.instance as { lifecycle?: PluginLifecycle } | undefined;
    const lifecycle = module?.lifecycle;

    if (lifecycle?.install) {
      await executeInPluginSandbox(manifest, () => lifecycle.install!(context));
    }

    logger.info(`[PluginLifecycle] 插件 ${pluginId} 已安装`);

    return {
      pluginId,
      ok: true,
      fromState,
      toState: 'installed',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    emitPluginError(pluginId, err);
    logger.error(`[PluginLifecycle] 安装 ${pluginId} 失败: ${err instanceof Error ? err.message : String(err)}`);

    return {
      pluginId,
      ok: false,
      fromState,
      toState: getLifecycleState(pluginId),
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

// ===================== 卸载插件 =====================

/** 卸载插件（清理所有资源 + 调用 uninstall 钩子） */
export async function uninstallPluginEntry(pluginId: string): Promise<LifecycleOperationResult> {
  const startTime = Date.now();
  const fromState = getLifecycleState(pluginId);

  try {
    assertTransition(fromState, 'uninstalling');

    const entry = pluginRuntimeRegistry.find(pluginId);
    if (entry) {
      const context = createPluginContext({ manifest: entry.manifest });
      const module = entry.instance as { lifecycle?: PluginLifecycle } | undefined;
      const lifecycle = module?.lifecycle;

      if (lifecycle?.uninstall) {
        await executeInPluginSandbox(entry.manifest, () => lifecycle.uninstall!(context));
      }
    }

    // 清理资源
    destroyPluginContext(pluginId);
    revokeAllPluginPermissions(pluginId);
    cleanupPluginSandbox(pluginId);

    assertTransition(fromState, 'uninstalled');

    getGlobalEventBus().emit(EVENT_PLUGIN_UNINSTALLED, { pluginId, timestamp: Date.now() });

    logger.info(`[PluginLifecycle] 插件 ${pluginId} 已卸载`);

    return {
      pluginId,
      ok: true,
      fromState,
      toState: 'uninstalled',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    emitPluginError(pluginId, err);
    logger.error(`[PluginLifecycle] 卸载 ${pluginId} 失败: ${err instanceof Error ? err.message : String(err)}`);

    return {
      pluginId,
      ok: false,
      fromState,
      toState: getLifecycleState(pluginId),
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

// ===================== 更新插件 =====================

/** 更新插件（调用 update 钩子，传递 fromVersion） */
export async function updatePluginEntry(
  manifest: PluginManifest,
  fromVersion: string,
  config?: Record<string, unknown>,
): Promise<LifecycleOperationResult> {
  const startTime = Date.now();
  const pluginId = manifest.id;
  const fromState = getLifecycleState(pluginId);

  try {
    assertTransition(fromState, 'updating');

    const entry = pluginRuntimeRegistry.find(pluginId);
    if (!entry) {
      throw new PluginLifecycleError(
        `插件 ${pluginId} 未注册，无法更新`,
        fromState,
        'updating',
        pluginId,
      );
    }

    const context = createPluginContext({ manifest, config });
    const module = entry.instance as { lifecycle?: PluginLifecycle } | undefined;
    const lifecycle = module?.lifecycle;

    if (lifecycle?.update) {
      await executeInPluginSandbox(manifest, () => lifecycle.update!(fromVersion, context));
    }

    // 更新注册表中的 manifest
    pluginRuntimeRegistry.registerManifest(manifest, {
      capabilities: manifest.capabilities,
      status: 'installed',
    });

    assertTransition(fromState, 'installed');

    getGlobalEventBus().emit(EVENT_PLUGIN_UPDATED, {
      pluginId,
      fromVersion,
      toVersion: manifest.version,
      timestamp: Date.now(),
    });

    logger.info(`[PluginLifecycle] 插件 ${pluginId} 已更新: ${fromVersion} → ${manifest.version}`);

    return {
      pluginId,
      ok: true,
      fromState,
      toState: 'installed',
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    emitPluginError(pluginId, err);
    logger.error(`[PluginLifecycle] 更新 ${pluginId} 失败: ${err instanceof Error ? err.message : String(err)}`);

    return {
      pluginId,
      ok: false,
      fromState,
      toState: getLifecycleState(pluginId),
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

// ===================== 查询 =====================

/** 获取插件当前生命周期状态 */
export function getPluginLifecycleState(pluginId: string): LifecycleState {
  return getLifecycleState(pluginId);
}

/** 列出所有插件的生命周期状态 */
export function listPluginLifecycleStates(): Array<{ pluginId: string; state: LifecycleState }> {
  return listLifecycleStates();
}

/** 检查插件是否处于活跃状态（enabled） */
export function isPluginActive(pluginId: string): boolean {
  return getLifecycleState(pluginId) === 'enabled';
}

/** 检查插件是否已安装（非 uninstalled） */
export function isPluginInstalled(pluginId: string): boolean {
  const state = getLifecycleState(pluginId);
  return state !== 'uninstalled';
}

// 重新导出底层 API
export {
  assertTransition,
  invokeLifecycleHook,
  type LifecycleState,
};
