/**
 * 装饰器 — @plugin / @hook / @command / @tool
 *
 * TypeScript 装饰器仅对 class / method 有效。这里实现为「元数据写入式」装饰器：
 * - 装饰后的 class / method 通过 getPluginMetadata / getHookMetadata 取回元数据
 * - 宿主在加载插件时读取这些元数据并自动注册
 *
 * 注意：本项目 tsconfig 启用了 experimentalDecorators 吗？
 * - server/tsconfig.json 没有 experimentalDecorators，所以装饰器语法在生产构建中可能不可用
 * - 因此本模块额外提供 createPlugin / createHook / createTool / createCommand 函数式 API
 *   作为装饰器的替代方案
 */

import type {
  PluginDefinition,
  PluginSdkApi,
  PluginSdkToolRegistration,
  PluginCommandDefinition,
  PluginDecoratorMetadata,
  PluginContext,
} from './types.js';

/**
 * Reflect 元数据 API 的类型化包装。
 *
 * 项目 tsconfig 未启用 reflect-metadata 类型，因此 Reflect.defineMetadata /
 * Reflect.getMetadata 不在标准 lib 类型中。这里通过类型断言提供签名，避免
 * 在每个调用点重复 as 断言。
 */
const ReflectMeta = Reflect as unknown as {
  defineMetadata(
    metadataKey: symbol,
    metadataValue: unknown,
    target: unknown,
    propertyKey?: string | symbol,
  ): void;
  getMetadata(
    metadataKey: symbol,
    target: unknown,
    propertyKey?: string | symbol,
  ): any;
};

const PLUGIN_METADATA_KEY = Symbol('plugin-sdk:plugin');
const HOOK_METADATA_KEY = Symbol('plugin-sdk:hook');
const TOOL_METADATA_KEY = Symbol('plugin-sdk:tool');
const COMMAND_METADATA_KEY = Symbol('plugin-sdk:command');

/** 类装饰器：声明一个插件 */
export function plugin(options: { id: string; name: string; description?: string; version?: string }) {
  return function <T extends new (...args: unknown[]) => unknown>(target: T): T {
    const meta: PluginDecoratorMetadata = {
      kind: 'plugin',
      name: options.id,
      description: options.name,
      metadata: { ...options },
    };
    ReflectMeta.defineMetadata(PLUGIN_METADATA_KEY, meta, target);
    return target;
  };
}

/** 方法装饰器：声明一个 hook */
export function hook(hookName: string, options: { priority?: number } = {}) {
  return function (target: object, propertyKey: string, descriptor: TypedPropertyDescriptor<unknown>) {
    const meta: PluginDecoratorMetadata = {
      kind: 'hook',
      name: hookName,
      priority: options.priority ?? 0,
    };
    ReflectMeta.defineMetadata(HOOK_METADATA_KEY, meta, target, propertyKey);
    return descriptor;
  };
}

/** 方法装饰器：声明一个工具 */
export function tool(name: string, description: string) {
  return function (target: object, propertyKey: string, descriptor: TypedPropertyDescriptor<unknown>) {
    const meta: PluginDecoratorMetadata = {
      kind: 'tool',
      name,
      description,
    };
    ReflectMeta.defineMetadata(TOOL_METADATA_KEY, meta, target, propertyKey);
    return descriptor;
  };
}

/** 方法装饰器：声明一个命令 */
export function command(name: string, description: string) {
  return function (target: object, propertyKey: string, descriptor: TypedPropertyDescriptor<unknown>) {
    const meta: PluginDecoratorMetadata = {
      kind: 'command',
      name,
      description,
    };
    ReflectMeta.defineMetadata(COMMAND_METADATA_KEY, meta, target, propertyKey);
    return descriptor;
  };
}

// ===================== 元数据读取 =====================

export function getPluginMetadata(target: unknown): PluginDecoratorMetadata | undefined {
  if (typeof target !== 'function' && typeof target !== 'object') return undefined;
  return ReflectMeta.getMetadata(PLUGIN_METADATA_KEY, target);
}

export function getHookMetadata(target: object, propertyKey: string): PluginDecoratorMetadata | undefined {
  return ReflectMeta.getMetadata(HOOK_METADATA_KEY, target, propertyKey);
}

export function getToolMetadata(target: object, propertyKey: string): PluginDecoratorMetadata | undefined {
  return ReflectMeta.getMetadata(TOOL_METADATA_KEY, target, propertyKey);
}

export function getCommandMetadata(target: object, propertyKey: string): PluginDecoratorMetadata | undefined {
  return ReflectMeta.getMetadata(COMMAND_METADATA_KEY, target, propertyKey);
}

// ===================== 函数式替代 API =====================

/**
 * 函数式创建插件定义（推荐用法）。
 *
 * 与装饰器方式等价，但不依赖 experimentalDecorators。
 */
export function definePlugin(options: {
  id: string;
  name: string;
  description?: string;
  version?: string;
  configSchema?: import('../plugins/types.js').PluginConfigSchema;
  capabilities?: import('../plugins/types.js').PluginCapabilityKind[];
  setup?: (context: PluginContext) => Promise<void> | void;
  register: (api: PluginSdkApi) => void | Promise<void>;
}): PluginDefinition {
  return {
    id: options.id,
    name: options.name,
    description: options.description,
    version: options.version,
    registrationMode: 'full',
    configSchema: options.configSchema,
    capabilities: options.capabilities,
    setup: options.setup,
    register: options.register,
  };
}

/**
 * 函数式定义工具（不依赖装饰器）。
 */
export function defineTool(options: PluginSdkToolRegistration): PluginSdkToolRegistration {
  return { ...options };
}

/**
 * 函数式定义命令。
 */
export function defineCommand(options: PluginCommandDefinition): PluginCommandDefinition {
  return { ...options };
}

/**
 * 函数式定义 hook。
 */
export function defineHook(
  hookName: string,
  handler: (payload: unknown) => unknown,
  options: { priority?: number; metadata?: Record<string, unknown> } = {},
): { hookName: string; handler: (payload: unknown) => unknown; priority: number; metadata?: Record<string, unknown> } {
  return {
    hookName,
    handler,
    priority: options.priority ?? 0,
    metadata: options.metadata,
  };
}

/**
 * 校验插件 ID 是否合法。
 */
const PLUGIN_ID_PATTERN = /^[a-z0-9_-]+$/;
export function isValidPluginId(id: string): boolean {
  return typeof id === 'string' && PLUGIN_ID_PATTERN.test(id);
}
