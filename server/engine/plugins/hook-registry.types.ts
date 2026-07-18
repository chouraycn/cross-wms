/**
 * 定义插件 hook 注册表条目与派发类型。
 *
 * 降级说明：原实现依赖 ../hooks/types.js 的 HookEntry 与
 * ./hook-types.js 的 PluginHookRegistration，cross-wms 已移植
 * ./hook-types.js（降级版），../hooks/types.js 暂未移植，HookEntry
 * 以 unknown 占位。
 */

/** 全局 hook runner 注册表存储的旧版 hook 注册项。 */
export type PluginLegacyHookRegistration = {
  pluginId: string;
  entry: unknown;
  events: string[];
  source: string;
  rootDir?: string;
};

/** hook runner 注册表状态（含旧版与类型化插件 hook）。 */
export type HookRunnerRegistry = {
  hooks: PluginLegacyHookRegistration[];
  typedHooks: import("./hook-types.js").PluginHookRegistration[];
};

/** 带插件加载状态的全局 hook runner 注册表快照。 */
export type GlobalHookRunnerRegistry = HookRunnerRegistry & {
  plugins: Array<{
    id: string;
    status: "loaded" | "disabled" | "error";
  }>;
};
