/**
 * 插件运行时存储 — 进程级单例 slot，未初始化时访问抛错
 *
 * 设计：通过 Symbol.for(...) 在 globalThis 上维护命名 slot 注册表，
 * 保证 SDK 模块重复实例化时仍共享同一 plugin runtime。
 *
 * 注：openclaw 原版 re-export 了 `PluginRuntime` 类型来自
 * `../plugins/runtime/types.js`，cross-wms 暂无该类型，已裁剪；
 * 调用方可使用泛型参数 T 自行指定运行时类型。
 *
 * 参考 openclaw/src/plugin-sdk/runtime-store.ts
 */

const pluginRuntimeStoreRegistryKey = Symbol.for('openclaw.plugin-sdk.runtime-store-registry');

type PluginRuntimeStoreRegistry = Map<string, { runtime: unknown }>;

type PluginRuntimeStoreKeyOptions = {
  /** 显式全局注册表 key，用于共享 runtime slot。 */
  key: string;
  /** getRuntime 在 setRuntime 初始化前抛出的错误信息。 */
  errorMessage: string;
};

type PluginRuntimeStorePluginOptions = {
  /** 插件 id，用于派生稳定的跨模块 runtime slot key。 */
  pluginId: string;
  /** getRuntime 在 setRuntime 初始化前抛出的错误信息。 */
  errorMessage: string;
};

type PluginRuntimeStoreOptions = PluginRuntimeStoreKeyOptions | PluginRuntimeStorePluginOptions;

function getPluginRuntimeStoreRegistry(): PluginRuntimeStoreRegistry {
  const globalRecord = globalThis as typeof globalThis & {
    [pluginRuntimeStoreRegistryKey]?: PluginRuntimeStoreRegistry;
  };
  globalRecord[pluginRuntimeStoreRegistryKey] ??= new Map();
  return globalRecord[pluginRuntimeStoreRegistryKey]!;
}

function pluginRuntimeStoreKeyForPluginId(pluginId: string): string {
  const normalizedPluginId = pluginId.trim();
  if (!normalizedPluginId) {
    throw new Error('createPluginRuntimeStore: pluginId must not be empty');
  }
  return `plugin-runtime:${normalizedPluginId}`;
}

function resolvePluginRuntimeStoreOptions(
  options: string | PluginRuntimeStoreOptions,
): PluginRuntimeStoreKeyOptions {
  if (typeof options === 'string') {
    return { key: options, errorMessage: options };
  }
  if ('pluginId' in options) {
    return {
      key: pluginRuntimeStoreKeyForPluginId(options.pluginId),
      errorMessage: options.errorMessage,
    };
  }
  return options;
}

/** 运行时 slot 的对外契约。 */
export type PluginRuntimeStore<T> = {
  setRuntime: (next: T) => void;
  clearRuntime: () => void;
  tryGetRuntime: () => T | null;
  getRuntime: () => T;
};

/**
 * 创建进程级 runtime slot，未初始化时访问抛错。
 *
 * - 字符串 key：创建模块局部存储
 * - 选项对象：创建全局命名 slot，保证 SDK 模块重复实例化时共享同一 runtime
 *
 * 重载 1：仅传入错误信息字符串，使用局部 slot。
 */
export function createPluginRuntimeStore<T>(errorMessage: string): PluginRuntimeStore<T>;
/** 重载 2：使用 pluginId 或显式 key 创建全局共享 slot。 */
export function createPluginRuntimeStore<T>(
  options: PluginRuntimeStoreOptions,
): PluginRuntimeStore<T>;
export function createPluginRuntimeStore<T>(
  options: string | PluginRuntimeStoreOptions,
): PluginRuntimeStore<T> {
  const resolved = resolvePluginRuntimeStoreOptions(options);
  const slot =
    typeof options === 'string'
      ? { runtime: null }
      : (() => {
          // 命名 slot 存储于 globalThis，使 SDK 模块重复实例化时仍共享同一 runtime。
          const registry = getPluginRuntimeStoreRegistry();
          let existingSlot = registry.get(resolved.key);
          if (!existingSlot) {
            existingSlot = { runtime: null };
            registry.set(resolved.key, existingSlot);
          }
          return existingSlot;
        })();

  return {
    setRuntime(next: T) {
      slot.runtime = next;
    },
    clearRuntime() {
      slot.runtime = null;
    },
    tryGetRuntime() {
      return (slot.runtime as T | null) ?? null;
    },
    getRuntime() {
      if (slot.runtime === null) {
        throw new Error(resolved.errorMessage);
      }
      return slot.runtime as T;
    },
  };
}
