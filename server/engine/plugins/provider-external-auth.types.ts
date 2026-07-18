/**
 * 定义 provider 插件的外部认证契约。
 *
 * 降级说明：原实现依赖 ../agents/auth-profiles/types.js 的
 * AuthProfileStore、OAuthCredential，../config/types.js 的
 * ModelProviderAuthMode、ModelProviderConfig，../config/types.openclaw.js
 * 的 OpenClawConfig，cross-wms 暂未移植这些模块，这里以本地占位类型替代。
 */

/** OpenClaw 配置（降级为 unknown 占位）。 */
export type OpenClawConfig = Record<string, unknown>;

/** 认证 profile 存储（降级为 unknown 占位）。 */
export type AuthProfileStore = unknown;

/** OAuth 凭证（降级为 unknown 占位）。 */
export type OAuthCredential = unknown;

/** 模型 provider 认证模式。 */
export type ModelProviderAuthMode = "api_key" | "oauth" | "aws-sdk" | "none" | string;

/** 模型 provider 配置（降级为 unknown 占位）。 */
export type ModelProviderConfig = unknown;

/** 从配置解析合成 provider 凭证的上下文。 */
export type ProviderResolveSyntheticAuthContext = {
  config?: OpenClawConfig;
  provider: string;
  providerConfig?: ModelProviderConfig;
};

/** 插件认证辅助返回的合成 provider 凭证。 */
export type ProviderSyntheticAuthResult = {
  apiKey: string;
  source: string;
  mode: Exclude<ModelProviderAuthMode, "aws-sdk">;
  expiresAt?: number;
};

/** 解析外部 provider 认证 profile 的上下文。 */
export type ProviderResolveExternalAuthProfilesContext = {
  config?: OpenClawConfig;
  agentDir?: string;
  workspaceDir?: string;
  env: NodeJS.ProcessEnv;
  store: AuthProfileStore;
};

/** OAuth 专属外部认证 profile 解析上下文。 */
export type ProviderResolveExternalOAuthProfilesContext =
  ProviderResolveExternalAuthProfilesContext;

/** 为 provider 解析得到的外部认证 profile 凭证。 */
export type ProviderExternalAuthProfile = {
  profileId: string;
  credential: OAuthCredential;
  persistence?: "runtime-only" | "persisted";
};

/** OAuth 专属 provider 外部认证 profile 别名。 */
export type ProviderExternalOAuthProfile = ProviderExternalAuthProfile;
