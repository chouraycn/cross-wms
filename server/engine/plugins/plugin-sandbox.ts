/**
 * Plugin SDK 沙箱 — 包装 ./sandbox.ts 提供 SDK 层 API
 *
 * 与现有 ./sandbox.ts 的关系：
 * - ./sandbox.ts 是底层沙箱实现（资源限制、熔断、统计）
 * - 本文件是 SDK 层包装，提供：
 *   - 按 manifest 自动配置沙箱限制
 *   - 与 plugin-context 集成的受限 API 创建
 *   - 沙箱状态查询与重置
 */

import type { PluginManifest } from './types.js';
import {
  runInSandbox,
  getSandboxStats,
  listAllSandboxStats,
  resetSandboxStats,
  resetCircuitBreaker,
  detectDangerousCode,
  DEFAULT_SANDBOX_LIMITS,
} from './sandbox.js';
import type {
  SandboxResourceLimits,
  SandboxCallResult,
  SandboxStats,
  CircuitBreakerConfig,
} from './sandbox.js';
import {
  DEFAULT_SANDBOX_TIMEOUT_MS,
  DEFAULT_SANDBOX_MAX_MEMORY_BYTES,
  DEFAULT_SANDBOX_MAX_INVOCATIONS,
  DEFAULT_SANDBOX_MAX_FETCH_CALLS,
  RISK_LEVEL_HIGH_RISK,
  RISK_LEVEL_CONFIRM,
} from './plugin-constants.js';
import { PluginSandboxTimeoutError, PluginSandboxResourceError } from './plugin-errors.js';

// ===================== 沙箱配置 =====================

/** 根据 manifest 风险等级推导沙箱限制 */
export function deriveSandboxLimits(manifest: PluginManifest): SandboxResourceLimits {
  const riskLevel = manifest.riskLevel ?? 'auto';

  switch (riskLevel) {
    case RISK_LEVEL_HIGH_RISK:
      return {
        timeoutMs: Math.floor(DEFAULT_SANDBOX_TIMEOUT_MS / 2), // 15s
        maxMemoryDeltaBytes: Math.floor(DEFAULT_SANDBOX_MAX_MEMORY_BYTES / 4), // 32MB
        maxInvocations: Math.floor(DEFAULT_SANDBOX_MAX_INVOCATIONS / 4), // 250
        maxFetchCalls: Math.floor(DEFAULT_SANDBOX_MAX_FETCH_CALLS / 4), // 25
      };
    case RISK_LEVEL_CONFIRM:
      return {
        timeoutMs: DEFAULT_SANDBOX_TIMEOUT_MS,
        maxMemoryDeltaBytes: DEFAULT_SANDBOX_MAX_MEMORY_BYTES,
        maxInvocations: DEFAULT_SANDBOX_MAX_INVOCATIONS,
        maxFetchCalls: DEFAULT_SANDBOX_MAX_FETCH_CALLS,
      };
    case 'auto':
    default:
      return { ...DEFAULT_SANDBOX_LIMITS };
  }
}

/** 沙箱配置（按插件 ID 缓存） */
const sandboxConfigRegistry = new Map<string, SandboxResourceLimits>();

/** 为插件设置沙箱配置 */
export function setPluginSandboxConfig(pluginId: string, limits: SandboxResourceLimits): void {
  sandboxConfigRegistry.set(pluginId, limits);
}

/** 获取插件沙箱配置（如未设置则返回默认值） */
export function getPluginSandboxConfig(pluginId: string): SandboxResourceLimits {
  return sandboxConfigRegistry.get(pluginId) ?? { ...DEFAULT_SANDBOX_LIMITS };
}

/** 根据 manifest 初始化沙箱配置 */
export function initializePluginSandbox(manifest: PluginManifest): SandboxResourceLimits {
  const limits = deriveSandboxLimits(manifest);
  setPluginSandboxConfig(manifest.id, limits);
  return limits;
}

// ===================== 沙箱执行 =====================

/** 在沙箱中执行函数（带 manifest 配置） */
export async function executeInPluginSandbox<T>(
  manifest: PluginManifest,
  fn: () => T | Promise<T>,
): Promise<SandboxCallResult<T>> {
  const limits = getPluginSandboxConfig(manifest.id);
  const wrappedFn = async (): Promise<T> => fn();
  const result = await runInSandbox<T>(manifest.id, wrappedFn, { limits });

  if (result.timedOut) {
    throw new PluginSandboxTimeoutError(
      `插件 ${manifest.id} 执行超时 (${limits.timeoutMs}ms)`,
      limits.timeoutMs,
      manifest.id,
    );
  }

  if (!result.ok && result.error) {
    // 检查是否为资源限制错误
    if (result.error.includes('内存') || result.error.includes('memory')) {
      throw new PluginSandboxResourceError(result.error, 'memory', manifest.id);
    }
    if (result.error.includes('调用次数') || result.error.includes('invocation')) {
      throw new PluginSandboxResourceError(result.error, 'invocations', manifest.id);
    }
  }

  return result;
}

/** 检查代码安全性（manifest 入口文件内容扫描） */
export function scanPluginCodeSafety(code: string, pluginId?: string): {
  safe: boolean;
  warnings: string[];
} {
  const warning = detectDangerousCode(code);
  const warnings: string[] = warning ? [warning] : [];
  return {
    safe: warnings.length === 0,
    warnings: warnings.map((w) => (pluginId ? `[${pluginId}] ${w}` : w)),
  };
}

// ===================== 沙箱状态 =====================

/** 获取插件沙箱统计 */
export function getPluginSandboxStats(pluginId: string): SandboxStats | undefined {
  return getSandboxStats(pluginId);
}

/** 列出所有插件沙箱统计 */
export function listAllPluginSandboxStats(): SandboxStats[] {
  return listAllSandboxStats();
}

/** 重置插件沙箱统计 */
export function resetPluginSandboxStats(pluginId?: string): void {
  resetSandboxStats(pluginId);
}

/** 重置插件熔断器 */
export function resetPluginCircuitBreaker(pluginId: string): void {
  resetCircuitBreaker(pluginId);
}

/** 清理插件沙箱配置（卸载时调用） */
export function cleanupPluginSandbox(pluginId: string): void {
  sandboxConfigRegistry.delete(pluginId);
  resetSandboxStats(pluginId);
  resetCircuitBreaker(pluginId);
}

// ===================== 熔断器配置 =====================

/** 熔断器配置注册表 */
const breakerConfigRegistry = new Map<string, CircuitBreakerConfig>();

/** 设置插件熔断器配置 */
export function setPluginCircuitBreakerConfig(pluginId: string, config: CircuitBreakerConfig): void {
  breakerConfigRegistry.set(pluginId, config);
}

/** 获取插件熔断器配置 */
export function getPluginCircuitBreakerConfig(pluginId: string): CircuitBreakerConfig | undefined {
  return breakerConfigRegistry.get(pluginId);
}

// 重新导出底层 API
export {
  runInSandbox,
  DEFAULT_SANDBOX_LIMITS,
};
export type {
  SandboxResourceLimits,
  SandboxCallResult,
  SandboxStats,
  CircuitBreakerConfig,
};
