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

// 动态导入 server/gateway 请求作用域；失败时回退到 undefined。
export async function getPluginRuntimeGatewayRequestScope(): Promise<GatewayRequestScope | undefined> {
  try {
    const specifier: string = '../../../server/gateway/gatewayRequestScope.js';
    const mod = (await import(specifier)) as {
      getCurrentGatewayRequestScope?: () => GatewayRequestScope | undefined;
    };
    return mod.getCurrentGatewayRequestScope?.();
  } catch {
    return undefined;
  }
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

// 动态导入 server/gateway 插件 HTTP 路由注册表；失败时回退到空注册表。
export async function getPluginHttpRegistry(): Promise<PluginHttpRegistry> {
  try {
    const specifier: string = '../../../server/gateway/pluginHttpRegistry.js';
    const mod = (await import(specifier)) as {
      getRegisteredPluginPaths?: () => PluginHttpPathRegistration[];
    };
    return { registrations: mod.getRegisteredPluginPaths?.() ?? [] };
  } catch {
    return { registrations: [] };
  }
}

/** 全局钩子运行器句柄。 */
export type GlobalHookRunner = {
  /** 运行指定钩子类型。 */
  run(type: string, context: unknown): Promise<unknown>;
};

// 动态导入 server/engine/hooks 的 runHooks；失败时回退到 no-op。
export function initializeGlobalHookRunner(_runner?: GlobalHookRunner): GlobalHookRunner {
  return {
    run: async (type: string, context: unknown) => {
      try {
        const specifier: string = '../../../server/engine/hooks/hooks.js';
        const mod = (await import(specifier)) as {
          runHooks?: (event: unknown) => Promise<void>;
          createHookEvent?: (
            type: string,
            action: string,
            sessionKey: string,
            context?: Record<string, unknown>,
          ) => { messages?: unknown[] };
        };
        if (typeof mod.runHooks !== 'function' || typeof mod.createHookEvent !== 'function') {
          return undefined;
        }
        const eventContext = (context ?? {}) as Record<string, unknown>;
        const event = mod.createHookEvent(type, 'trigger', 'plugin-runtime', eventContext);
        await mod.runHooks(event);
        return event.messages;
      } catch {
        return undefined;
      }
    },
  };
}

// 动态导入 server/engine/hooks 的 clearInternalHooks；失败时静默回退。
export function resetGlobalHookRunner(): void {
  const specifier: string = '../../../server/engine/hooks/internal-hooks.js';
  import(specifier)
    .then((mod: { clearInternalHooks?: () => void }) => {
      mod.clearInternalHooks?.();
    })
    .catch(() => {});
}

/** 交互式绑定辅助上下文。 */
export type InteractiveBindingContext = {
  pluginId: string;
  prompt(message: string): Promise<string>;
};

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
export async function runInteractiveBinding(
  _context: InteractiveBindingContext,
): Promise<void> {
  // 待 plugins/interactive.js 移植后接入
}

/** 懒加载服务模块描述。 */
export type LazyServiceModule<T = unknown> = {
  load(): Promise<T>;
};

// Contract stub; runtime routed to server/engine/plugin-sdk by resolver.
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
