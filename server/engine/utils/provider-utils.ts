/**
 * Provider behavior helpers shared by reply runners, embedded agents, and provider plugins.
 * Keep policy here generic; provider-specific reasoning rules belong in provider runtime hooks.
 *
 * Simplified port: the openclaw original calls `resolveProviderReasoningOutputModeWithPlugin`
 * from `../plugins/provider-runtime.js`, which is not yet ported to cross-wms. Until that hook
 * lands, this module defaults to native reasoning output for all providers.
 */
import { normalizeOptionalString } from "../infra/string-coerce.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { ProviderRuntimePluginHandle } from "../plugins/provider-hook-runtime.js";
import type { ProviderRuntimeModel } from "../plugins/provider-runtime-model.types.js";

/**
 * Resolves whether a provider should emit reasoning via native fields or tagged text,
 * using provider runtime hooks when available and defaulting to native output.
 */
function resolveReasoningOutputMode(params: {
  provider: string | undefined | null;
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
  modelId?: string;
  modelApi?: string | null;
  model?: ProviderRuntimeModel;
  runtimeHandle?: ProviderRuntimePluginHandle;
}): "native" | "tagged" {
  const provider = normalizeOptionalString(params.provider);
  if (!provider) {
    return "native";
  }

  // Provider hooks own model/API-specific reasoning transport rules; core only supplies the default.
  // TODO: once `resolveProviderReasoningOutputModeWithPlugin` is ported, delegate here.
  return "native";
}

/**
 * Returns true if the provider requires reasoning to be wrapped in tags
 * (e.g. <think> and <final>) in the text stream, rather than using native
 * API fields for reasoning/thinking.
 */
export function isReasoningTagProvider(
  provider: string | undefined | null,
  options?: {
    config?: OpenClawConfig;
    workspaceDir?: string;
    env?: NodeJS.ProcessEnv;
    modelId?: string;
    modelApi?: string | null;
    model?: ProviderRuntimeModel;
    runtimeHandle?: ProviderRuntimePluginHandle;
  },
): boolean {
  return (
    resolveReasoningOutputMode({
      provider,
      config: options?.config,
      workspaceDir: options?.workspaceDir,
      env: options?.env,
      modelId: options?.modelId,
      modelApi: options?.modelApi,
      model: options?.model,
      runtimeHandle: options?.runtimeHandle,
    }) === "tagged"
  );
}
