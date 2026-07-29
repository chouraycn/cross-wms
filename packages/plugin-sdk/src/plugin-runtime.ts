// 插件运行时公共 SDK 大桶。
// @deprecated 原 openclaw 实现从 ../plugins/** 重导出大量模块，依赖未移植。
// 此处提供最小可用类型与桩函数，建议优先使用更聚焦的 plugin runtime 子路径。

/** 运行时日志记录器接口。 */
export type RuntimeLogger = {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
};

/** 插件运行时上下文，注入到插件入口供其访问宿主能力。 */
export type PluginRuntime = {
  /** 插件 ID。 */
  pluginId: string;
  /** 运行时日志记录器。 */
  logger: RuntimeLogger;
  /** 运行时配置快照（只读）。 */
  config?: Record<string, unknown>;
};

/** Gateway 请求作用域，标识经认证的插件 HTTP 路由。 */
export type GatewayRequestScope = {
  gatewayMethodDispatchAllowed?: boolean;
  pluginId?: string;
};

// TODO: 依赖模块未移植，暂用本地桩
export function getPluginRuntimeGatewayRequestScope(): GatewayRequestScope | undefined {
  return undefined;
}

/** 插件 HTTP 路径注册描述。 */
export type PluginHttpPathRegistration = {
  /** 插件 ID。 */
  pluginId: string;
  /** HTTP 路径（相对网关根）。 */
  path: string;
  /** HTTP 方法。 */
  method: string;
};

/** 插件 HTTP 注册表。 */
export type PluginHttpRegistry = {
  registrations: PluginHttpPathRegistration[];
};

// TODO: 依赖模块未移植，暂用本地桩
export function getPluginHttpRegistry(): PluginHttpRegistry {
  return { registrations: [] };
}

/** 全局钩子运行器句柄。 */
export type GlobalHookRunner = {
  /** 运行指定钩子类型。 */
  run(type: string, context: unknown): Promise<unknown>;
};

// TODO: 依赖模块未移植，暂用本地桩
export function initializeGlobalHookRunner(_runner?: GlobalHookRunner): GlobalHookRunner {
  return {
    run: async (_type: string, _context: unknown) => undefined,
  };
}

// TODO: 依赖模块未移植，暂用本地桩
export function resetGlobalHookRunner(): void {
  // 待 plugins/hook-runner-global.js 移植后接入
}

/** 交互式绑定辅助上下文。 */
export type InteractiveBindingContext = {
  pluginId: string;
  prompt(message: string): Promise<string>;
};

// TODO: 依赖模块未移植，暂用本地桩
export async function runInteractiveBinding(
  _context: InteractiveBindingContext,
): Promise<void> {
  // 待 plugins/interactive.js 移植后接入
}

/** 懒加载服务模块描述。 */
export type LazyServiceModule<T = unknown> = {
  load(): Promise<T>;
};

// TODO: 依赖模块未移植，暂用本地桩
export function createLazyServiceModule<T>(
  loader: () => Promise<T>,
): LazyServiceModule<T> {
  let cached: T | undefined;
  return {
    async load() {
      if (cached === undefined) {
        cached = await loader();
      }
      return cached;
    },
  };
}
