/**
 * 移植自 openclaw/src/agents/models-config.merge.ts
 *
 * 降级实现：提供 provider 模型配置合并，不再抛出 stub 错误。
 */

export type ExistingProviderConfig = {
  models?: Record<string, any>;
  secrets?: Record<string, any>;
  [key: string]: any;
};

export function mergeProviderModels(base: Record<string, any>, override: Record<string, any>): Record<string, any> {
  return { ...base, ...override };
}

export function mergeProviders(base: Record<string, ExistingProviderConfig>, override: Record<string, ExistingProviderConfig>): Record<string, ExistingProviderConfig> {
  return { ...base, ...override };
}

export function mergeWithExistingProviderSecrets(config: ExistingProviderConfig, _existing?: ExistingProviderConfig): ExistingProviderConfig {
  return config;
}
