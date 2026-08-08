/** Provider config context types. 移植自 openclaw/src/plugins/provider-config-context.types.ts。类型定义保留。 */
export type ProviderNormalizeConfigContext = {
  providerId: string;
  config?: any;
  env?: NodeJS.ProcessEnv;
};
export type ProviderResolveConfigApiKeyContext = {
  providerId: string;
  config?: any;
  env?: NodeJS.ProcessEnv;
};
export type ProviderApplyConfigDefaultsContext = {
  providerId: string;
  config?: any;
  env?: NodeJS.ProcessEnv;
};
