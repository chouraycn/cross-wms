// 移植自 openclaw/src/config/plugins-allowlist.ts
// 规范化 plugin allowlist 配置，供加载和校验使用。
//
// 该文件为零外部依赖的纯类型与函数模块，无需降级。

type PluginAllowlistConfigCarrier = {
  plugins?: {
    allow?: string[];
  };
};

/** 返回一个配置副本，将 pluginId 追加到已存在的限制性 plugin allowlist 中。 */
export function ensurePluginAllowlisted<T extends PluginAllowlistConfigCarrier>(
  cfg: T,
  pluginId: string,
): T {
  const allow = cfg.plugins?.allow;
  if (!Array.isArray(allow) || allow.includes(pluginId)) {
    // 缺失 allowlist 表示无限制加载插件；避免创建新的限制性列表。
    return cfg;
  }
  return {
    ...cfg,
    plugins: {
      ...cfg.plugins,
      allow: [...allow, pluginId],
    },
  } as T;
}
