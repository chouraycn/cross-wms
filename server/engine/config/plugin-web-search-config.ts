// 移植自 openclaw/src/config/plugin-web-search-config.ts
// 规范化 plugin web-search 配置和默认值。
//
// 降级说明：源文件依赖 @openclaw/normalization-core/record-coerce 的 isRecord。
// 此处内联等价实现，与 mcp-config-normalize.ts 等已移植文件的降级策略一致。

// 降级说明：内联 isRecord，等价于 @openclaw/normalization-core/record-coerce 导出。
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

type PluginWebSearchConfigCarrier = {
  plugins?: {
    entries?: Record<
      string,
      {
        config?: unknown;
      }
    >;
  };
};

/** 解析 plugin 拥有的 `config.webSearch` 对象，不解释 provider 字段。 */
export function resolvePluginWebSearchConfig(
  config: PluginWebSearchConfigCarrier | undefined,
  pluginId: string,
): Record<string, unknown> | undefined {
  const pluginConfig = config?.plugins?.entries?.[pluginId]?.config;
  if (!isRecord(pluginConfig)) {
    return undefined;
  }
  return isRecord(pluginConfig.webSearch) ? pluginConfig.webSearch : undefined;
}
