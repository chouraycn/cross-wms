/**
 * Plugin Entry — 插件入口助手
 *
 * 参考 OpenClaw 的 definePluginEntry()，提供标准化的插件入口定义。
 *
 * 插件作者通过 definePluginEntry() 声明插件的：
 *   - 元数据（id, name, description）
 *   - 配置 Schema
 *   - 注册模式
 *   - register() 函数（在其中调用 api.registerTool/registerProvider/...）
 *   - 可选 setup() 钩子
 *
 * 示例：
 * ```ts
 * export default definePluginEntry({
 *   id: 'my-provider',
 *   name: 'My Provider',
 *   description: 'A custom model provider',
 *   configSchema: {
 *     fields: [
 *       { key: 'apiKey', type: 'string', label: 'API Key', required: true },
 *     ],
 *   },
 *   register(api) {
 *     api.registerProvider({
 *       kind: 'provider',
 *       id: 'my-provider',
 *       displayName: 'My Provider',
 *       apiType: 'openai-chat',
 *       apiKeyEnvVar: 'MY_PROVIDER_API_KEY',
 *     });
 *   },
 * });
 * ```
 */

import { emptyPluginConfigSchema } from './types.js';
import type {
  PluginDefinition,
  PluginConfigSchema,
  RegistrationMode,
  PluginApi,
  PluginLifecycleContext,
} from './types.js';

/** definePluginEntry 的选项 */
export interface DefinePluginEntryOptions {
  /** 插件唯一 ID（小写字母、数字、连字符） */
  id: string;
  /** 显示名 */
  name: string;
  /** 描述 */
  description: string;
  /** 配置 Schema（默认空） */
  configSchema?: PluginConfigSchema | (() => PluginConfigSchema);
  /** 注册模式（默认 'full'） */
  registrationMode?: RegistrationMode;
  /** 注册函数 */
  register: (api: PluginApi) => void | Promise<void>;
  /** 可选 setup 钩子 */
  setup?: (ctx: PluginLifecycleContext) => Promise<void> | void;
}

/** definePluginEntry 返回的标准化结构 */
export type DefinedPluginEntry = PluginDefinition;

/** 缓存 lazy getter 工厂 */
function createCachedLazyValueGetter<T>(factory: (() => T) | T): () => T {
  let cached: T | undefined;
  let computed = false;
  return () => {
    if (!computed) {
      cached = typeof factory === 'function' ? (factory as () => T)() : factory;
      computed = true;
    }
    return cached as T;
  };
}

/**
 * 插件入口助手 — 标准化插件定义
 *
 * @param options - 插件选项
 * @returns 标准化的 PluginDefinition
 */
export function definePluginEntry({
  id,
  name,
  description,
  configSchema = emptyPluginConfigSchema,
  registrationMode = 'full',
  register,
  setup,
}: DefinePluginEntryOptions): DefinedPluginEntry {
  if (!id || typeof id !== 'string') {
    throw new Error('definePluginEntry: id is required and must be a string');
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`definePluginEntry: id must match /^[a-z0-9-]+$/, got: ${id}`);
  }
  if (typeof register !== 'function') {
    throw new Error('definePluginEntry: register must be a function');
  }

  const getConfigSchema = createCachedLazyValueGetter(configSchema);

  return {
    id,
    name,
    description,
    get configSchema() {
      return getConfigSchema();
    },
    registrationMode,
    register,
    ...(setup ? { setup } : {}),
  };
}
