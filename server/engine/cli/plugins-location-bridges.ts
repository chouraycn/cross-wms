// Bridge builder for users upgrading from bundled plugins to external plugin packages.
// 移植自 openclaw/src/cli/plugins-location-bridges.ts。
//
// 降级策略：
//  - 原模块依赖多个未移植的 openclaw 内部模块：
//    ../plugins/bundled-load-path-aliases.js、
//    ../plugins/externalized-bundled-plugins.js、
//    ../plugins/installed-plugin-index-store.js、
//    ../plugins/installed-plugin-index.js、
//    ../plugins/manifest-registry-installed.js、
//    ../plugins/manifest-registry.js、
//    ../plugins/official-external-plugin-catalog.js
//  - 这些模块在 cross-wms 中尚未移植；这里对涉及这些依赖的函数提供
//    降级实现（始终返回空数组），保留函数签名以便未来替换为正式实现。

// ===== 内联 ExternalizedBundledPluginBridge 类型占位 =====
/**
 * 从 bundled 迁移到外部插件包的桥接信息（降级占位）。
 *
 * 降级原因：openclaw 的 externalized-bundled-plugins 模块尚未移植。
 * 这里定义结构兼容的类型，字段与 openclaw 源一致。
 */
export type ExternalizedBundledPluginBridge = {
  bundledPluginId: string;
  pluginId: string;
  preferredSource: "npm" | "clawhub";
  npmSpec?: string;
  clawhubSpec?: string;
  enabledByDefault?: boolean;
  channelIds?: readonly string[];
};
// ===== 类型占位结束 =====

/** 用户从 bundled 插件迁移到外部插件包时，需保留的恢复位置信息。 */
export type PersistedBundledPluginRecoveryLocation = {
  pluginId: string;
  loadPaths: readonly string[];
};

/**
 * 列出从持久化的 installed plugin index 推断的安装桥接记录。
 *
 * 降级实现：openclaw 的 installed-plugin-index-store 与
 * manifest-registry-installed 模块尚未移植。这里始终返回空数组，
 * 保留函数签名以便未来替换为正式实现。
 */
export async function listPersistedBundledPluginLocationBridges(_options: {
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<readonly ExternalizedBundledPluginBridge[]> {
  return [];
}

/**
 * 列出显式插件重装可恢复的精确先前 bundled 路径。
 *
 * 降级实现：openclaw 的 installed-plugin-index-store 与
 * bundled-load-path-aliases 模块尚未移植。这里始终返回空数组，
 * 保留函数签名以便未来替换为正式实现。
 */
export async function listPersistedBundledPluginRecoveryLocations(_options: {
  env?: NodeJS.ProcessEnv;
}): Promise<readonly PersistedBundledPluginRecoveryLocation[]> {
  return [];
}
