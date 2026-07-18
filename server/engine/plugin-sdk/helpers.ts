/**
 * SDK 辅助工具 — 通用 helper 函数
 */

import type { PluginDefinition, PluginSdkApi, PluginContext, PluginManifest } from './types.js';

/**
 * 生成插件 ID（基于名称 + 随机后缀）。
 *
 * 用于开发者本地原型阶段，避免手动起名。
 */
export function generatePluginId(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

/**
 * 把 PluginDefinition 转成 PluginManifest（用于写入 plugin.json）。
 */
export function definitionToManifest(def: PluginDefinition): PluginManifest {
  return {
    id: def.id,
    name: def.name,
    displayName: def.name,
    description: def.description,
    version: def.version ?? '0.1.0',
    apiVersion: '1.0.0',
    capabilities: def.capabilities,
    configSchema: def.configSchema,
    metadata: {
      generatedAt: Date.now(),
    },
  };
}

/**
 * 合并多个插件定义为一个数组（用于插件包导出多个插件）。
 */
export function bundlePlugins(...defs: PluginDefinition[]): PluginDefinition[] {
  const seen = new Set<string>();
  const result: PluginDefinition[] = [];
  for (const def of defs) {
    if (seen.has(def.id)) {
      throw new Error(`[plugin-sdk] 重复的插件 ID: ${def.id}`);
    }
    seen.add(def.id);
    result.push(def);
  }
  return result;
}

/**
 * 简单的 debounce 工具（用于插件节流场景）。
 */
export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  waitMs: number,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      timer = null;
    }, waitMs);
  };
}

/**
 * 创建一个简单的 promise deferred（用于异步等待外部触发）。
 */
export function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * 安全调用插件 register 函数，捕获同步异常。
 */
export async function safeRegister(
  def: PluginDefinition,
  api: PluginSdkApi,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await def.register(api);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * 把 context 中的核心字段拷贝成一个简单对象（用于日志 / 调试）。
 */
export function summarizeContext(context: PluginContext): Record<string, unknown> {
  return {
    pluginId: context.pluginId,
    manifestId: context.manifest.id,
    manifestVersion: context.manifest.version,
  };
}

/**
 * 比较两个 manifest 是否相同（按 id + version）。
 */
export function isSameManifest(a: PluginManifest, b: PluginManifest): boolean {
  return a.id === b.id && a.version === b.version;
}

/**
 * 把 manifest 字段映射为 URL-safe 的查询参数（用于 marketplace 搜索）。
 */
export function manifestToSearchParams(manifest: PluginManifest): URLSearchParams {
  const params = new URLSearchParams();
  params.set('id', manifest.id);
  params.set('name', manifest.name);
  if (manifest.version) params.set('version', manifest.version);
  if (manifest.author) params.set('author', manifest.author);
  return params;
}
