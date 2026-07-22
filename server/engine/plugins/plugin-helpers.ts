/**
 * Plugin Helpers — 插件 SDK 辅助函数
 *
 * 提供高层次的便捷函数，组合多个 SDK 模块。
 * 与 ./plugin-utils.ts 的区别：
 * - plugin-utils.ts 是纯工具函数（无副作用）
 * - plugin-helpers.ts 是组合函数（调用多个模块）
 */

import { logger } from '../../logger.js';
import type { PluginManifest, PluginCapabilityKind } from './types.js';
import {
  PluginSdkError,
  PluginManifestError,
  toPluginSdkError,
  isRecoverableError,
} from './plugin-errors.js';
import { validatePlugin, type PluginValidationResult } from './plugin-validator.js';
import { normalizePluginManifest } from './plugin-manifest.js';
import { resolvePluginDependencies } from './plugin-dependency-resolver.js';
import { capabilityProviderRegistry } from './capability-provider.js';
import { getChannelAdapterRuntime } from './channel-adapter-runtime.js';
import { getChannelHealthChecker } from './channel-health-checker.js';
import { getChannelMessageRouter } from './channel-message-router.js';
import { getPluginVersionRegistry } from './plugin-version-manager.js';
import {
  manifestToSummary,
  getDisplayName,
  isHighRisk,
} from './plugin-utils.js';

// ===================== 插件注册辅助 =====================

/** 安全注册插件：先校验再注册 */
export async function safeRegisterPlugin(
  manifest: PluginManifest,
  options: {
    installedPlugins?: Set<string>;
    onValidated?: (manifest: PluginManifest, result: PluginValidationResult) => void;
    onRegistered?: (manifest: PluginManifest) => void;
  } = {},
): Promise<{ ok: boolean; manifest?: PluginManifest; error?: string; warnings?: string[] }> {
  try {
    // 1. 校验
    const result = validatePlugin(manifest, {
      installedPlugins: options.installedPlugins,
    });
    if (!result.valid) {
      return {
        ok: false,
        error: `校验失败: ${result.violations.join(', ')}`,
      };
    }

    // 2. 规范化
    const normalized = normalizePluginManifest(manifest);

    // 3. 校验回调
    options.onValidated?.(normalized, result);

    // 4. 注册版本
    getPluginVersionRegistry().register(normalized.id, normalized.version, 'install');

    // 5. 注册回调
    options.onRegistered?.(normalized);

    return {
      ok: true,
      manifest: normalized,
      ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** 安全卸载插件：清理所有相关资源 */
export async function safeUnregisterPlugin(pluginId: string): Promise<{ ok: boolean; cleanedUp: string[]; error?: string }> {
  const cleanedUp: string[] = [];
  try {
    // 1. 注销能力提供者
    const capCount = capabilityProviderRegistry.unregisterByPlugin(pluginId);
    if (capCount > 0) {
      cleanedUp.push(`capabilities:${capCount}`);
    }

    // 2. 断开并注销通道适配器
    const channelRuntime = getChannelAdapterRuntime();
    const channelEntry = channelRuntime.getEntry(pluginId);
    if (channelEntry) {
      await channelRuntime.unregister(pluginId);
      cleanedUp.push('channel-adapter');
    }

    // 3. 注销版本
    const versionReg = getPluginVersionRegistry();
    if (versionReg.getVersionInfo(pluginId)) {
      versionReg.unregister(pluginId);
      cleanedUp.push('version-record');
    }

    logger.info(`[PluginHelpers] 已清理 ${pluginId}: ${cleanedUp.join(', ') || '无'}`);
    return { ok: true, cleanedUp };
  } catch (err) {
    return {
      ok: false,
      cleanedUp,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ===================== 通道辅助 =====================

/** 启动通道系统（连接所有适配器 + 启动健康检查） */
export async function startChannelSystem(options?: {
  autoConnect?: boolean;
  healthCheckIntervalMs?: number;
}): Promise<{ connected: number; total: number; errors: string[] }> {
  const runtime = getChannelAdapterRuntime();

  if (options?.autoConnect !== undefined) {
    runtime.configure({ autoConnect: options.autoConnect });
  }

  const results = await runtime.connectAll();
  const connected = results.filter((r) => r.ok).length;
  const errors = results.filter((r) => !r.ok).map((r) => `${r.providerId}: ${r.error}`);

  // 启动健康检查
  const healthChecker = getChannelHealthChecker();
  if (options?.healthCheckIntervalMs) {
    healthChecker.configure({ intervalMs: options.healthCheckIntervalMs });
  }
  healthChecker.start();

  logger.info(`[PluginHelpers] 通道系统已启动: ${connected}/${results.length} 已连接`);
  return { connected, total: results.length, errors };
}

/** 停止通道系统（断开所有适配器 + 停止健康检查） */
export async function stopChannelSystem(): Promise<void> {
  const healthChecker = getChannelHealthChecker();
  healthChecker.stop();

  const runtime = getChannelAdapterRuntime();
  await runtime.disconnectAll();

  logger.info('[PluginHelpers] 通道系统已停止');
}

/** 获取通道系统状态摘要 */
export function getChannelSystemSummary(): {
  adapters: number;
  connected: number;
  healthy: number;
  unhealthy: number;
  routes: number;
  totalMessages: number;
} {
  const runtime = getChannelAdapterRuntime();
  const healthChecker = getChannelHealthChecker();
  const router = getChannelMessageRouter();
  const stats = router.getStats();

  const adapters = runtime.list();
  const connected = adapters.filter((a) => a.state === 'connected').length;
  const metrics = healthChecker.listMetrics();
  const healthy = metrics.filter((m) => m.healthy).length;
  const unhealthy = metrics.filter((m) => !m.healthy).length;

  return {
    adapters: adapters.length,
    connected,
    healthy,
    unhealthy,
    routes: router.listRules().length,
    totalMessages: stats.totalMessages,
  };
}

// ===================== 诊断辅助 =====================

/** 获取插件诊断信息 */
export function diagnosePlugin(pluginId: string): {
  pluginId: string;
  version?: string;
  capabilities: Array<{ kind: PluginCapabilityKind; providerId: string }>;
  channel?: { state: string; messageCount: number; lastError?: string };
  health?: { healthy: boolean; errorCount: number; latencyMs?: number };
} {
  const versionInfo = getPluginVersionRegistry().getVersionInfo(pluginId);
  const capEntries = capabilityProviderRegistry.listAll()
    .flatMap(({ kind, entries }) => entries
      .filter((e) => e.pluginId === pluginId)
      .map((e) => ({ kind, providerId: (e.provider as { id: string }).id })));

  const channelEntry = getChannelAdapterRuntime().getEntry(pluginId);
  const channelHealth = getChannelHealthChecker().getMetric(pluginId);

  return {
    pluginId,
    ...(versionInfo?.currentVersion !== undefined ? { version: versionInfo.currentVersion } : {}),
    capabilities: capEntries,
    ...(channelEntry !== undefined ? {
      channel: {
        state: channelEntry.state,
        messageCount: channelEntry.messageCount,
        ...(channelEntry.lastError !== undefined ? { lastError: channelEntry.lastError } : {}),
      },
    } : {}),
    ...(channelHealth !== undefined ? {
      health: {
        healthy: channelHealth.healthy,
        errorCount: channelHealth.errorCount,
        ...(channelHealth.latencyMs !== undefined ? { latencyMs: channelHealth.latencyMs } : {}),
      },
    } : {}),
  };
}

/** 获取所有插件诊断信息 */
export function diagnoseAllPlugins(): Array<ReturnType<typeof diagnosePlugin>> {
  const versionReg = getPluginVersionRegistry();
  const pluginIds = new Set<string>();

  // 从版本注册表获取
  for (const info of versionReg.list()) {
    pluginIds.add(info.pluginId);
  }

  // 从能力提供者获取
  for (const { entries } of capabilityProviderRegistry.listAll()) {
    for (const entry of entries) {
      pluginIds.add(entry.pluginId);
    }
  }

  // 从通道适配器获取
  for (const adapter of getChannelAdapterRuntime().list()) {
    pluginIds.add(adapter.pluginId);
  }

  return Array.from(pluginIds).map((id) => diagnosePlugin(id));
}

// ===================== 快捷创建辅助 =====================

/** 从 manifest 创建插件摘要 */
export function createPluginSummary(manifest: PluginManifest): string {
  const summary = manifestToSummary(manifest);
  const parts: string[] = [
    `${summary.id}@${summary.version}`,
    `"${summary.name}"`,
  ];
  if (summary.description) {
    parts.push(`- ${summary.description}`);
  }
  if (summary.capabilities.length > 0) {
    parts.push(`[capabilities: ${summary.capabilities.join(', ')}]`);
  }
  if (summary.toolCount > 0) {
    parts.push(`[tools: ${summary.toolCount}]`);
  }
  if (isHighRisk(manifest)) {
    parts.push('[HIGH RISK]');
  }
  return parts.join(' ');
}

/** 检查插件是否可以安全卸载 */
export function canSafelyUninstall(pluginId: string): { safe: boolean; dependents: string[] } {
  // 检查是否有其他插件依赖此插件
  // 这里简化处理，实际需要检查所有已注册插件的依赖声明
  const allDiags = diagnoseAllPlugins();
  const dependents: string[] = [];

  for (const diag of allDiags) {
    if (diag.pluginId === pluginId) continue;
    // 如果其他插件提供了此插件依赖的能力，不应阻止卸载
    // 这里仅检查能力提供者的依赖关系
    if (diag.capabilities.some((c) => c.providerId === pluginId)) {
      dependents.push(diag.pluginId);
    }
  }

  return {
    safe: dependents.length === 0,
    dependents,
  };
}

/** 错误处理辅助：将错误转换为用户可读消息 */
export function formatPluginError(error: unknown): string {
  if (error instanceof PluginSdkError) {
    const parts: string[] = [error.message];
    if (error.pluginId) {
      parts.push(`(plugin: ${error.pluginId})`);
    }
    if (!isRecoverableError(error)) {
      parts.push('[不可恢复]');
    }
    return parts.join(' ');
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
