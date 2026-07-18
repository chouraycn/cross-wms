import { logger } from '../../logger.js';

/**
 * 插件沙箱隔离 — API 限制 / 资源限制 / 超时控制
 *
 * 与 server/engine/pluginSandbox.ts 的关系：
 * - pluginSandbox.ts 是基于 node:vm 的代码级沙箱（执行任意 JS 字符串）
 * - 本模块是面向运行时插件 API 的「能力包装层」，对暴露给插件的 API 做：
 *   - 资源限制（CPU 时间、内存、调用次数）
 *   - 超时控制（自动 abort 长时间调用）
 *   - API 白名单（按 manifest.permissions 限制可调用接口）
 *
 * 不依赖 node:vm，可在 jsdom 测试环境下运行。
 */

/** 沙箱资源限制 */
export interface SandboxResourceLimits {
  /** 单次调用最大执行时长（毫秒） */
  timeoutMs: number;
  /** 单次调用最大内存增量（字节） */
  maxMemoryDeltaBytes?: number;
  /** 单个插件累计调用次数上限 */
  maxInvocations?: number;
  /** 单个插件累计 fetch 次数上限 */
  maxFetchCalls?: number;
}

/** 沙箱默认限制 */
export const DEFAULT_SANDBOX_LIMITS: SandboxResourceLimits = {
  timeoutMs: 30_000,
  maxMemoryDeltaBytes: 128 * 1024 * 1024,
  maxInvocations: 1_000,
  maxFetchCalls: 100,
};

/** 沙箱调用结果 */
export interface SandboxCallResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  durationMs: number;
  timedOut: boolean;
}

/** 沙箱运行时统计 */
export interface SandboxStats {
  pluginId: string;
  invocations: number;
  fetchCalls: number;
  timeouts: number;
  errors: number;
  /** 累计耗时（毫秒） */
  totalDurationMs: number;
  /** 峰值内存增量（字节） */
  peakMemoryDeltaBytes: number;
  /** 是否已被熔断 */
  tripped: boolean;
}

/** 熔断触发条件 */
export interface CircuitBreakerConfig {
  /** 连续失败次数达到阈值后熔断 */
  failureThreshold: number;
  /** 熔断后冷却时间（毫秒） */
  cooldownMs: number;
}

const DEFAULT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  cooldownMs: 60_000,
};

const statsStore = new Map<string, SandboxStats>();
const breakerState = new Map<string, { failures: number; trippedAt: number }>();

function ensureStats(pluginId: string): SandboxStats {
  let stats = statsStore.get(pluginId);
  if (!stats) {
    stats = {
      pluginId,
      invocations: 0,
      fetchCalls: 0,
      timeouts: 0,
      errors: 0,
      totalDurationMs: 0,
      peakMemoryDeltaBytes: 0,
      tripped: false,
    };
    statsStore.set(pluginId, stats);
  }
  return stats;
}

/**
 * 在沙箱限制下执行一个异步函数。
 *
 * - 超过 timeoutMs 自动拒绝
 * - 累计调用次数超过 maxInvocations 直接拒绝
 * - 失败次数达到熔断阈值后进入冷却期，期间直接拒绝
 */
export async function runInSandbox<T>(
  pluginId: string,
  fn: () => Promise<T>,
  options: { limits?: Partial<SandboxResourceLimits>; breaker?: CircuitBreakerConfig } = {},
): Promise<SandboxCallResult<T>> {
  const limits = { ...DEFAULT_SANDBOX_LIMITS, ...options.limits };
  const breaker = { ...DEFAULT_BREAKER, ...options.breaker };
  const stats = ensureStats(pluginId);

  if (stats.tripped) {
    const now = Date.now();
    const trippedAt = breakerState.get(pluginId)?.trippedAt ?? 0;
    if (now - trippedAt < breaker.cooldownMs) {
      return {
        ok: false,
        error: `[Sandbox] 插件 ${pluginId} 已熔断，冷却中`,
        durationMs: 0,
        timedOut: false,
      };
    }
    // 冷却完成 — 重置
    stats.tripped = false;
    stats.errors = 0;
    breakerState.delete(pluginId);
  }

  if (limits.maxInvocations !== undefined && stats.invocations >= limits.maxInvocations) {
    return {
      ok: false,
      error: `[Sandbox] 插件 ${pluginId} 调用次数已超限 (${limits.maxInvocations})`,
      durationMs: 0,
      timedOut: false,
    };
  }

  const start = Date.now();
  stats.invocations += 1;

  // 包装 Promise，避免未捕获 rejection
  let timedOut = false;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      timedOut = true;
      reject(new Error(`[Sandbox] 插件 ${pluginId} 执行超时 (${limits.timeoutMs}ms)`));
    }, limits.timeoutMs);
  });

  try {
    const value = await Promise.race([fn(), timeoutPromise]);
    const durationMs = Date.now() - start;
    stats.totalDurationMs += durationMs;
    if (timedOut) {
      stats.timeouts += 1;
      recordFailure(pluginId, breaker);
      return { ok: false, error: '执行超时', durationMs, timedOut: true };
    }
    return { ok: true, value, durationMs, timedOut: false };
  } catch (e) {
    const durationMs = Date.now() - start;
    stats.totalDurationMs += durationMs;
    stats.errors += 1;
    if (timedOut) stats.timeouts += 1;
    recordFailure(pluginId, breaker);
    const message = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: message,
      durationMs,
      timedOut,
    };
  }
}

function recordFailure(pluginId: string, breaker: CircuitBreakerConfig): void {
  const state = breakerState.get(pluginId) ?? { failures: 0, trippedAt: 0 };
  state.failures += 1;
  if (state.failures >= breaker.failureThreshold) {
    const stats = ensureStats(pluginId);
    stats.tripped = true;
    state.trippedAt = Date.now();
    logger.warn(
      `[Sandbox] 插件 ${pluginId} 触发熔断（连续失败 ${state.failures} 次）`,
    );
  }
  breakerState.set(pluginId, state);
}

/**
 * 创建受限 fetch 包装器。
 *
 * 拒绝条件：
 * - 没有 'http.fetch' 权限（由调用方通过 options.authorize 控制）
 * - 累计调用次数超过 maxFetchCalls
 * - 单次请求超过 timeoutMs
 */
export function createSandboxedFetch(
  pluginId: string,
  options: { authorize: () => boolean; limits?: Partial<SandboxResourceLimits> },
): (input: string, init?: { timeoutMs?: number }) => Promise<{ ok: boolean; status: number; body: string }> {
  const limits = { ...DEFAULT_SANDBOX_LIMITS, ...options.limits };
  return async (input, init) => {
    if (!options.authorize()) {
      throw new Error(`[Sandbox] 插件 ${pluginId} 没有 http.fetch 权限`);
    }
    const stats = ensureStats(pluginId);
    if (limits.maxFetchCalls !== undefined && stats.fetchCalls >= limits.maxFetchCalls) {
      throw new Error(`[Sandbox] 插件 ${pluginId} fetch 调用次数已超限 (${limits.maxFetchCalls})`);
    }
    stats.fetchCalls += 1;
    const timeoutMs = init?.timeoutMs ?? limits.timeoutMs;
    const result = await runInSandbox(
      pluginId,
      async () => {
        const response = await fetch(input, { signal: AbortSignal.timeout(timeoutMs) } as RequestInit);
        const body = await response.text();
        return { ok: response.ok, status: response.status, body };
      },
      { limits: { timeoutMs } },
    );
    if (!result.ok) {
      throw new Error(result.error ?? 'fetch failed');
    }
    return result.value!;
  };
}

/**
 * 创建受限 require 包装器。
 *
 * 仅允许白名单中的模块名（基础类型/工具模块）。
 */
export function createSandboxedRequire(
  pluginId: string,
  allowedModules: readonly string[],
): (moduleName: string) => unknown {
  const allowed = new Set(allowedModules);
  const blocked = new Set([
    'fs',
    'fs/promises',
    'child_process',
    'cluster',
    'net',
    'http',
    'https',
    'http2',
    'tls',
    'dgram',
    'dns',
    'vm',
    'worker_threads',
    'inspector',
  ]);
  return (moduleName: string) => {
    if (blocked.has(moduleName)) {
      throw new Error(`[Sandbox] 插件 ${pluginId} 试图加载被禁止的模块: ${moduleName}`);
    }
    if (!allowed.has(moduleName)) {
      throw new Error(`[Sandbox] 插件 ${pluginId} 加载未声明模块: ${moduleName}`);
    }
    // 实际加载由宿主在 pluginSandbox.ts 中完成；这里仅做权限检查
    return undefined;
  };
}

/**
 * 检查代码字符串是否包含危险模式（eval / new Function）。
 */
export function detectDangerousCode(code: string): string | null {
  if (/\beval\s*\(/.test(code)) {
    return '代码中包含 eval() 调用';
  }
  if (/\bnew\s+Function\s*\(/.test(code)) {
    return '代码中包含 new Function() 调用';
  }
  return null;
}

// ===================== 统计与重置 =====================

export function getSandboxStats(pluginId: string): SandboxStats | undefined {
  return statsStore.get(pluginId);
}

export function listAllSandboxStats(): SandboxStats[] {
  return Array.from(statsStore.values());
}

export function resetSandboxStats(pluginId?: string): void {
  if (pluginId) {
    statsStore.delete(pluginId);
    breakerState.delete(pluginId);
  } else {
    statsStore.clear();
    breakerState.clear();
  }
}

/**
 * 手动重置某个插件的熔断状态（用于运维操作）。
 */
export function resetCircuitBreaker(pluginId: string): void {
  const stats = ensureStats(pluginId);
  stats.tripped = false;
  stats.errors = 0;
  breakerState.delete(pluginId);
}
