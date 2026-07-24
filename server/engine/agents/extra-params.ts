/**
 * 移植自 openclaw/src/agents/embedded-agent-runner/extra-params.ts
 *
 * Resolves model extra parameters and transport overrides for embedded agents.
 * cross-wms 简化实现：提供基本的参数合并和 transport 解析。
 */

type SupportedTransport = "sse" | "websocket" | "auto";

function resolveSupportedTransport(value: unknown): SupportedTransport | undefined {
  return value === "sse" || value === "websocket" || value === "auto" ? value : undefined;
}

/** Resolve provider-specific extra params from model config. */
export function resolveExtraParams(params: {
  cfg?: Record<string, unknown>;
  provider: string;
  modelId: string;
  agentId?: string;
}): Record<string, unknown> | undefined {
  const config = params.cfg;
  if (!config) {
    return undefined;
  }
  const agents = config.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const defaultParams = defaults?.params as Record<string, unknown> | undefined;

  const models = defaults?.models as Record<string, Record<string, unknown>> | undefined;
  const modelConfig = models?.[`${params.provider}/${params.modelId}`] ?? models?.[params.modelId];
  const globalParams = modelConfig?.params ? { ...modelConfig.params } : undefined;

  const agentParams =
    params.agentId && Array.isArray(agents?.list)
      ? (agents!.list as Array<Record<string, unknown>>).find((agent) => agent.id === params.agentId)?.params
      : undefined;

  const merged = Object.assign({}, defaultParams, globalParams, agentParams);
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Resolve prepared extra params with caching. */
export function resolvePreparedExtraParams(params: {
  cfg?: Record<string, unknown>;
  provider: string;
  modelId: string;
  agentDir?: string;
  workspaceDir?: string;
  extraParamsOverride?: Record<string, unknown>;
  thinkingLevel?: unknown;
  agentId?: string;
  resolvedExtraParams?: Record<string, unknown>;
  model?: unknown;
  resolvedTransport?: SupportedTransport;
  providerRuntimeHandle?: unknown;
}): Record<string, unknown> {
  const resolvedExtraParams =
    params.resolvedExtraParams ??
    resolveExtraParams({
      cfg: params.cfg,
      provider: params.provider,
      modelId: params.modelId,
      agentId: params.agentId,
    });

  const override = params.extraParamsOverride;
  if (!override || Object.keys(override).length === 0) {
    return resolvedExtraParams ?? {};
  }

  const merged = { ...resolvedExtraParams, ...override };
  // Strip prototype keys - use type assertion to avoid TS2790
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(merged)) {
    if (key !== '__proto__' && key !== 'prototype' && key !== 'constructor') {
      result[key] = merged[key];
    }
  }
  return result;
}

/** Resolve transport override from extra params. */
export function resolveAgentTransportOverride(params: {
  settingsManager?: { getGlobalSettings: () => Record<string, unknown>; getProjectSettings: () => Record<string, unknown> };
  effectiveExtraParams?: Record<string, unknown>;
}): SupportedTransport | undefined {
  if (!params.settingsManager) {
    return undefined;
  }
  const globalSettings = params.settingsManager.getGlobalSettings();
  const projectSettings = params.settingsManager.getProjectSettings();
  if (Object.hasOwn(globalSettings, "transport") || Object.hasOwn(projectSettings, "transport")) {
    return undefined;
  }
  return resolveSupportedTransport(params.effectiveExtraParams?.transport);
}

/** Resolve transport from explicit settings. */
export function resolveExplicitSettingsTransport(params: {
  settingsManager?: { getGlobalSettings: () => Record<string, unknown>; getProjectSettings: () => Record<string, unknown> };
  sessionTransport: unknown;
}): SupportedTransport | undefined {
  if (!params.settingsManager) {
    return undefined;
  }
  const globalSettings = params.settingsManager.getGlobalSettings();
  const projectSettings = params.settingsManager.getProjectSettings();
  if (!Object.hasOwn(globalSettings, "transport") && !Object.hasOwn(projectSettings, "transport")) {
    return undefined;
  }
  return resolveSupportedTransport(params.sessionTransport);
}

/** Apply extra params to an agent — simplified in cross-wms. */
export function applyExtraParamsToAgent(
  agent: { streamFn?: unknown },
  cfg: Record<string, unknown> | undefined,
  provider: string,
  modelId: string,
  extraParamsOverride?: Record<string, unknown>,
  thinkingLevel?: unknown,
  agentId?: string,
  workspaceDir?: string,
  model?: unknown,
  agentDir?: string,
  resolvedTransport?: SupportedTransport,
  options?: {
    preparedExtraParams?: Record<string, unknown>;
    nativeWebSearchPolicyContext?: unknown;
  },
): { effectiveExtraParams: Record<string, unknown> } {
  const resolvedExtraParams = resolveExtraParams({ cfg, provider, modelId, agentId });
  const effectiveExtraParams =
    options?.preparedExtraParams ??
    resolvePreparedExtraParams({
      cfg,
      provider,
      modelId,
      extraParamsOverride,
      thinkingLevel,
      agentId,
      agentDir,
      workspaceDir,
      resolvedExtraParams,
      model,
      resolvedTransport,
    });

  return { effectiveExtraParams };
}

export const testing_extra_params = {
  setProviderRuntimeDepsForTest: () => {},
  resetProviderRuntimeDepsForTest: () => {},
};
