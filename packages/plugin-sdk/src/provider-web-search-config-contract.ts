// 网页搜索配置契约的公共安全辅助：面向不需要插件启用/选择接线的提供商插件。
// openclaw 原始实现从 ../plugins/types.js、../agents/tools/web-search-provider-config.js、
// ./provider-web-search-contract-fields.js 重导出，依赖未移植。此处提供最小可用实现。

/** 网页搜索凭据解析来源标记。 */
export type WebSearchCredentialResolutionSource = "config" | "env" | "store" | "fallback";

/** 网页搜索提供商 setup 上下文。 */
export type WebSearchProviderSetupContext = {
  /** 插件 ID。 */
  pluginId: string;
  /** 提示用户输入。 */
  prompt(message: string, defaultValue?: string): Promise<string>;
  /** 写入凭据。 */
  setCredential(key: string, value: string): Promise<void>;
  /** 读取凭据。 */
  getCredential(key: string): Promise<string | undefined>;
};

/** 网页搜索提供商插件描述。 */
export type WebSearchProviderPlugin = {
  /** 插件 ID。 */
  id: string;
  /** 显示名称。 */
  name?: string;
  /** 是否需要凭据。 */
  requiresCredentials?: boolean;
};

/** 网页搜索提供商工具定义。 */
export type WebSearchProviderToolDefinition = {
  /** 工具名称。 */
  name: string;
  /** 工具描述。 */
  description?: string;
  /** 输入 schema。 */
  inputSchema?: Record<string, unknown>;
};

/** 范围内凭据值解析结果。 */
export type ScopedCredentialValue = {
  value: string;
  source: WebSearchCredentialResolutionSource;
};

/** 提供商网页搜索插件配置。 */
export type ProviderWebSearchPluginConfig = {
  credentials?: Record<string, string>;
  scopedCredentials?: Record<string, Record<string, string>>;
  options?: Record<string, unknown>;
};

// TODO: 依赖模块未移植，暂用本地桩
export function getScopedCredentialValue(
  _config: ProviderWebSearchPluginConfig | undefined,
  _scope: string,
  key: string,
): string | undefined {
  return _config?.scopedCredentials?.[_scope]?.[key];
}

// TODO: 依赖模块未移植，暂用本地桩
export function getTopLevelCredentialValue(
  config: ProviderWebSearchPluginConfig | undefined,
  key: string,
): string | undefined {
  return config?.credentials?.[key];
}

// TODO: 依赖模块未移植，暂用本地桩
export function mergeScopedSearchConfig(
  base: ProviderWebSearchPluginConfig | undefined,
  _scoped: ProviderWebSearchPluginConfig | undefined,
): ProviderWebSearchPluginConfig {
  return base ?? {};
}

// TODO: 依赖模块未移植，暂用本地桩
export function resolveProviderWebSearchPluginConfig(
  _pluginId: string,
): ProviderWebSearchPluginConfig | undefined {
  return undefined;
}

// TODO: 依赖模块未移植，暂用本地桩
export function setScopedCredentialValue(
  config: ProviderWebSearchPluginConfig,
  scope: string,
  key: string,
  value: string,
): ProviderWebSearchPluginConfig {
  const scoped = config.scopedCredentials ?? {};
  scoped[scope] = { ...scoped[scope], [key]: value };
  return { ...config, scopedCredentials: scoped };
}

// TODO: 依赖模块未移植，暂用本地桩
export function setProviderWebSearchPluginConfigValue(
  config: ProviderWebSearchPluginConfig,
  key: string,
  value: unknown,
): ProviderWebSearchPluginConfig {
  const options = config.options ?? {};
  return { ...config, options: { ...options, [key]: value } };
}

// TODO: 依赖模块未移植，暂用本地桩
export function setTopLevelCredentialValue(
  config: ProviderWebSearchPluginConfig,
  key: string,
  value: string,
): ProviderWebSearchPluginConfig {
  const credentials = config.credentials ?? {};
  return { ...config, credentials: { ...credentials, [key]: value } };
}

/** 创建网页搜索提供商契约字段集（本地最小实现）。 */
export function createWebSearchProviderContractFields(): Record<string, unknown> {
  return {
    enabled: { type: "boolean", default: false, description: "是否启用该网页搜索提供商" },
    apiKey: { type: "secret", required: false, description: "提供商 API Key" },
  };
}
