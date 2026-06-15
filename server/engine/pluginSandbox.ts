/**
 * Plugin Sandbox — node:vm 沙箱执行环境
 *
 * v3.0: 使用 node:vm 模块在受限上下文中执行插件代码，
 * 限制 require/fs/network 访问，仅允许 manifest.permissions 中声明的模块。
 *
 * 安全策略:
 * - require 被代理为 sandboxedRequire，拒绝未声明模块
 * - fs / child_process / net / http 等危险模块默认禁止
 * - 超时: 默认 30s，manifest.metadata.timeoutMs 可覆盖
 * - 所有错误（超时/权限/运行时）统一返回 { ok: false, error }
 */

import vm from 'node:vm';
import type { PluginManifest } from '../../shared/pluginManifest.js';

// ===================== 类型定义 =====================

/** 沙箱执行结果 */
export interface SandboxResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  durationMs: number;
}

/** 默认超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * 危险模块黑名单 — 即使在 permissions 中声明也拒绝加载。
 * 这些模块可直接访问文件系统、网络、进程等系统资源。
 */
const DENIED_MODULES: ReadonlySet<string> = new Set([
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
  'crypto',
  'os',
  'path',
  'readline',
  'repl',
  'vm',
  'worker_threads',
  'inspector',
]);

/**
 * 安全模块白名单映射 — 这些模块已被安全封装，允许在沙箱中使用。
 * key: 模块名, value: 实际加载的模块
 */
const SAFE_BUILTIN_MODULES: Record<string, () => unknown> = {
  'util': () => require('util'),
  'events': () => require('events'),
  'url': () => require('url'),
  'querystring': () => require('querystring'),
  'assert': () => require('assert'),
  'buffer': () => require('buffer'),
  'stream': () => require('stream'),
  'string_decoder': () => require('string_decoder'),
  'zlib': () => require('zlib'),
  'timers': () => require('timers'),
  'timers/promises': () => require('timers/promises'),
};

// ===================== sandboxedRequire =====================

/**
 * 创建受限 require 函数。
 *
 * @param allowedModules - manifest.permissions 中声明的允许模块列表
 * @returns 代理 require 函数，拒绝未声明和危险模块
 */
function createSandboxedRequire(allowedModules: string[]): (moduleName: string) => unknown {
  const allowedSet = new Set(allowedModules);

  return function sandboxedRequire(moduleName: string): unknown {
    // 1. 检查是否在黑名单中
    if (DENIED_MODULES.has(moduleName)) {
      throw new Error(`[Sandbox] 权限拒绝: 模块 '${moduleName}' 属于危险模块，禁止在沙箱中加载`);
    }

    // 2. 检查是否在允许列表中
    if (!allowedSet.has(moduleName)) {
      throw new Error(`[Sandbox] 权限拒绝: 模块 '${moduleName}' 未在 manifest.permissions 中声明`);
    }

    // 3. 尝试从安全内置模块中获取
    if (SAFE_BUILTIN_MODULES[moduleName]) {
      return SAFE_BUILTIN_MODULES[moduleName]();
    }

    // 4. 不在白名单中的模块 — 拒绝加载（安全策略：仅允许 SAFE_BUILTIN_MODULES，禁止使用宿主 require）
    throw new Error(
      `[Sandbox] 权限拒绝: 模块 '${moduleName}' 不在安全模块白名单中。` +
      `允许的模块: ${Object.keys(SAFE_BUILTIN_MODULES).join(', ')}`
    );
  };
}

// ===================== executeInSandbox =====================

/**
 * 在 node:vm 沙箱中执行插件代码。
 *
 * @param code - 要执行的 JavaScript 代码字符串
 * @param manifest - 插件清单，包含 permissions、metadata 等
 * @param context - 额外注入到沙箱上下文中的变量
 * @returns SandboxResult — 包含执行结果、错误信息、耗时
 */
export async function executeInSandbox(
  code: string,
  manifest: PluginManifest,
  context?: Record<string, unknown>,
): Promise<SandboxResult> {
  const startTime = Date.now();

  // 解析超时时间 — 优先使用 manifest.metadata.timeoutMs
  const timeoutMs = resolveTimeoutMs(manifest);

  try {
    // 1. 构建 sandboxedRequire
    const sandboxedRequire = createSandboxedRequire(manifest.permissions);

    // 2. 构建沙箱上下文对象
    const sandbox: Record<string, unknown> = {
      // 基础全局对象
      console: {
        log: (...args: unknown[]) => console.log('[Plugin Sandbox]', ...args),
        warn: (...args: unknown[]) => console.warn('[Plugin Sandbox]', ...args),
        error: (...args: unknown[]) => console.error('[Plugin Sandbox]', ...args),
        info: (...args: unknown[]) => console.info('[Plugin Sandbox]', ...args),
        debug: (...args: unknown[]) => console.debug('[Plugin Sandbox]', ...args),
      },
      // 代理 require
      require: sandboxedRequire,
      // 标准全局
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      setImmediate,
      clearImmediate,
      JSON,
      Math,
      Date,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      ArrayBuffer,
      Uint8Array,
      Uint16Array,
      Uint32Array,
      Int8Array,
      Int16Array,
      Int32Array,
      Float32Array,
      Float64Array,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Promise,
      Symbol,
      Error,
      TypeError,
      RangeError,
      SyntaxError,
      ReferenceError,
      URIError,
      EvalError,
      RegExp,
      Array,
      Boolean,
      Number,
      String,
      Object,
      Function,
      // 注入额外上下文
      ...(context ?? {}),
    };

    // 3. 创建 VM Context
    vm.createContext(sandbox);

    // 4. 包装代码 — 使其返回模块导出
    // 插件代码中通常使用 module.exports = ... 或 exports.xxx = ...
    // 我们注入 module 和 exports 对象到沙箱中
    const moduleObj: { exports: Record<string, unknown> } = { exports: {} };
    sandbox.module = moduleObj;
    sandbox.exports = moduleObj.exports;

    // 5. 编译并执行代码（async IIFE，支持顶层 await）
    const wrappedCode = `
      (async function() {
        ${code}
      })();
    `;

    const script = new vm.Script(wrappedCode, {
      filename: `plugin://${manifest.id}/${manifest.entry}`,
      timeout: timeoutMs,
    });

    const maybePromise = script.runInContext(sandbox, {
      timeout: timeoutMs,
    });

    // 支持插件代码中的顶层 await — 异步 IIFE 返回 Promise，需要 await 捕获拒绝
    if (maybePromise instanceof Promise) {
      await maybePromise;
    }

    // 6. 获取执行结果 — 返回 module.exports
    const result = moduleObj.exports;
    const durationMs = Date.now() - startTime;

    return {
      ok: true,
      value: result,
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - startTime;

    let errorMessage: string;
    if (e instanceof Error) {
      // 区分超时错误和其他错误
      if (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        errorMessage = `执行超时: 插件 '${manifest.id}' 执行时间超过 ${timeoutMs}ms`;
      } else if (e.message.includes('[Sandbox] 权限拒绝')) {
        errorMessage = e.message;
      } else {
        errorMessage = `运行时错误: ${e.message}`;
      }
    } else {
      errorMessage = `未知错误: ${String(e)}`;
    }

    return {
      ok: false,
      error: errorMessage,
      durationMs,
    };
  }
}

// ===================== 辅助函数 =====================

/**
 * 从 manifest 中解析超时时间。
 *
 * 优先级:
 * 1. manifest.metadata.timeoutMs（数字）
 * 2. DEFAULT_TIMEOUT_MS（30s）
 */
function resolveTimeoutMs(manifest: PluginManifest): number {
  const metadataTimeout = manifest.metadata?.timeoutMs;
  if (typeof metadataTimeout === 'number' && metadataTimeout > 0 && metadataTimeout <= 300_000) {
    return metadataTimeout;
  }
  return DEFAULT_TIMEOUT_MS;
}
