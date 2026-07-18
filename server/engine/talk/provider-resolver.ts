/**
 * Realtime voice provider selection and config resolution.
 *
 * 自包含实现，参考 openclaw/src/talk/provider-resolver.ts。
 * 用本地解析逻辑替代 openclaw 的 resolveConfiguredCapabilityProvider，
 * 支持 default model 注入、per-call 覆盖与自动选择。
 */
import { getRealtimeVoiceProvider, listRealtimeVoiceProviders } from "./provider-registry.js";
import type {
  RealtimeVoiceProviderConfig,
  RealtimeVoiceProviderPlugin,
  TalkRuntimeConfig,
} from "./provider-types.js";

/** Resolved realtime voice provider plus provider-normalized config. */
export type ResolvedRealtimeVoiceProvider = {
  provider: RealtimeVoiceProviderPlugin;
  providerConfig: RealtimeVoiceProviderConfig;
};

/** Inputs for resolving a configured or auto-selected realtime voice provider. */
export type ResolveConfiguredRealtimeVoiceProviderParams = {
  configuredProviderId?: string;
  providerConfigs?: Record<string, Record<string, unknown> | undefined>;
  /** Last-mile overrides from a session/client request. */
  providerConfigOverrides?: Record<string, unknown>;
  cfg?: TalkRuntimeConfig;
  /** Test/runtime override for the provider list. */
  providers?: RealtimeVoiceProviderPlugin[];
  /** Model injected before provider-specific resolveConfig runs. */
  defaultModel?: string;
  noRegisteredProviderMessage?: string;
};

type ResolutionOk = {
  ok: true;
  provider: RealtimeVoiceProviderPlugin;
  providerConfig: RealtimeVoiceProviderConfig;
};

type ResolutionError =
  | { ok: false; code: "missing-configured-provider"; configuredProviderId: string }
  | { ok: false; code: "no-registered-provider"; provider?: RealtimeVoiceProviderPlugin }
  | {
      ok: false;
      code: "provider-not-configured";
      provider?: RealtimeVoiceProviderPlugin;
    };

/** Resolve the configured realtime voice provider or auto-select the first configured one. */
export function resolveConfiguredRealtimeVoiceProvider(
  params: ResolveConfiguredRealtimeVoiceProviderParams,
): ResolvedRealtimeVoiceProvider {
  const cfg = params.cfg ?? ({} as TalkRuntimeConfig);
  const providers = params.providers ?? listRealtimeVoiceProviders(params.cfg);
  const resolution = resolveProviderResolution({ ...params, cfg, providers });

  if (!resolution.ok && resolution.code === "missing-configured-provider") {
    throw new Error(
      `Realtime voice provider "${resolution.configuredProviderId}" is not registered`,
    );
  }
  if (!resolution.ok && resolution.code === "no-registered-provider") {
    throw new Error(params.noRegisteredProviderMessage ?? "No realtime voice provider registered");
  }
  if (!resolution.ok) {
    const providerId = resolution.provider?.id;
    throw new Error(
      `Realtime voice provider${providerId ? ` "${providerId}"` : ""} is not configured`,
    );
  }

  return {
    provider: resolution.provider,
    providerConfig: resolution.providerConfig,
  };
}

function resolveProviderResolution(
  params: ResolveConfiguredRealtimeVoiceProviderParams & {
    cfg: TalkRuntimeConfig;
    providers: RealtimeVoiceProviderPlugin[];
  },
): ResolutionOk | ResolutionError {
  const { cfg, providers } = params;

  if (providers.length === 0) {
    return { ok: false, code: "no-registered-provider" };
  }

  const getConfiguredProvider = (providerId: string) =>
    params.providers?.find((entry) => entry.id === providerId) ??
    getRealtimeVoiceProvider(providerId, params.cfg);

  // 1) 显式配置的 provider id
  if (params.configuredProviderId) {
    const provider = getConfiguredProvider(params.configuredProviderId);
    if (!provider) {
      return {
        ok: false,
        code: "missing-configured-provider",
        configuredProviderId: params.configuredProviderId,
      };
    }
    const rawConfig = params.providerConfigs?.[provider.id] ?? {};
    const providerConfig = resolveProviderConfig({ provider, cfg, rawConfig, context: params });
    if (!provider.isConfigured({ cfg, providerConfig })) {
      return { ok: false, code: "provider-not-configured", provider };
    }
    return { ok: true, provider, providerConfig };
  }

  // 2) 自动选择第一个已配置的 provider（按 autoSelectOrder 升序）
  const sortedProviders = [...providers].sort(
    (a, b) => (a.autoSelectOrder ?? Number.MAX_SAFE_INTEGER) - (b.autoSelectOrder ?? Number.MAX_SAFE_INTEGER),
  );
  for (const provider of sortedProviders) {
    const rawConfig = params.providerConfigs?.[provider.id] ?? {};
    const providerConfig = resolveProviderConfig({ provider, cfg, rawConfig, context: params });
    if (provider.isConfigured({ cfg, providerConfig })) {
      return { ok: true, provider, providerConfig };
    }
  }

  // 3) 没有任何 provider 处于已配置状态
  return { ok: false, code: "no-registered-provider", provider: sortedProviders[0] };
}

function resolveProviderConfig(params: {
  provider: RealtimeVoiceProviderPlugin;
  cfg: TalkRuntimeConfig;
  rawConfig: RealtimeVoiceProviderConfig;
  context: ResolveConfiguredRealtimeVoiceProviderParams;
}): RealtimeVoiceProviderConfig {
  const { provider, cfg, rawConfig, context } = params;
  // Provider config resolution should see the default model as if it came
  // from config, while explicit provider config still wins.
  const rawConfigWithModel =
    context.defaultModel && rawConfig.model === undefined
      ? { ...rawConfig, model: context.defaultModel }
      : rawConfig;
  const rawConfigWithOverrides = {
    ...rawConfigWithModel,
    ...context.providerConfigOverrides,
  };
  // Per-call overrides are applied before provider normalization so provider
  // implementations can validate and coerce them consistently.
  return (
    provider.resolveConfig?.({ cfg, rawConfig: rawConfigWithOverrides }) ??
    rawConfigWithOverrides
  );
}
