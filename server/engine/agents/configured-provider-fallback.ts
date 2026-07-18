/**
 * 当用户模型配置缺少默认值时，选择一个已配置的 provider/model 回退。
 *
 * 注意：原 openclaw 实现依赖 ../config/types.js 中的 OpenClawConfig 类型。
 * 本地降级实现：OpenClawConfig 视为结构化对象，仅做运行时字段访问。
 */

// OpenClawConfig 在本地未完整移植，这里以结构化降级类型处理。
type OpenClawConfigLike = {
  models?: {
    providers?: Record<string, ProviderConfigLike>;
  };
};

type ProviderModelRef = {
  provider: string;
  model: string;
};

type ProviderConfigLike = {
  models?: Array<{ id?: string } | undefined>;
};

/** 解析首个可替代缺失默认值的已配置 provider/model。 */
export function resolveConfiguredProviderFallback(params: {
  cfg: OpenClawConfigLike;
  defaultProvider: string;
  defaultModel?: string;
}): ProviderModelRef | null {
  const configuredProviders = params.cfg?.models?.providers;
  if (!configuredProviders) {
    return null;
  }
  const defaultProviderConfig = configuredProviders[params.defaultProvider];
  const defaultModel = params.defaultModel?.trim();
  const defaultProviderHasDefaultModel =
    Boolean(defaultProviderConfig) &&
    Boolean(defaultModel) &&
    Array.isArray(defaultProviderConfig.models) &&
    defaultProviderConfig.models.some((model) => model?.id === defaultModel);
  if (defaultProviderConfig && (!defaultModel || defaultProviderHasDefaultModel)) {
    return null;
  }
  // 回退到首个至少配置了一个模型的 provider，保留 config 插入顺序作为操作者偏好。
  const availableProvider = Object.entries(configuredProviders).find(
    ([, providerCfg]) =>
      providerCfg &&
      Array.isArray(providerCfg.models) &&
      providerCfg.models.length > 0 &&
      providerCfg.models[0]?.id,
  );
  if (!availableProvider) {
    return null;
  }
  const [provider, providerCfg] = availableProvider;
  const models = providerCfg.models;
  if (!Array.isArray(models) || !models[0]?.id) {
    return null;
  }
  return { provider, model: models[0].id };
}
