// 控制默认插件启用行为的清单字段。
// 原模块无外部依赖，为纯类型与简单函数。

/** 控制默认插件启用行为的清单字段。 */
export type PluginDefaultEnablement = {
  enabledByDefault?: boolean;
  enabledByDefaultOnPlatforms?: readonly string[];
};

/** 当插件应在指定平台上默认启用时返回 true。 */
export function isPluginEnabledByDefaultForPlatform(
  plugin: PluginDefaultEnablement,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (plugin.enabledByDefault === true) {
    return true;
  }
  return plugin.enabledByDefaultOnPlatforms?.includes(platform) === true;
}
