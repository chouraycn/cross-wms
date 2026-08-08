/**
 * Tool model config and auth helpers.
 *
 * Model-backed tools use this module to choose provider/model refs and check
 * whether candidate providers have usable auth before exposing defaults.
 *
 * Simplified for cross-wms: preserves core types and config helpers;
 * auth/profile integration requires service-level setup.
 */

export type ToolModelConfig = { primary?: string; fallbacks?: string[]; timeoutMs?: number };

type AgentToolModelConfig = {
  primary?: string;
  fallbacks?: string[];
  timeoutMs?: number;
};

export function hasToolModelConfig(model: ToolModelConfig | undefined): boolean {
  return Boolean(
    model?.primary?.trim() || (model?.fallbacks ?? []).some((entry) => entry.trim().length > 0),
  );
}

function resolveAgentModelPrimaryValue(model?: AgentToolModelConfig): string | undefined {
  const primary = model?.primary;
  return typeof primary === "string" && primary.trim() ? primary.trim() : undefined;
}

function resolveAgentModelFallbackValues(model?: AgentToolModelConfig): string[] {
  const fallbacks = model?.fallbacks;
  if (!Array.isArray(fallbacks)) {
    return [];
  }
  return fallbacks.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function resolveAgentModelTimeoutMsValue(model?: AgentToolModelConfig): number | undefined {
  const timeoutMs = model?.timeoutMs;
  return typeof timeoutMs === "number" && Number.isFinite(timeoutMs) && timeoutMs >= 0
    ? Math.floor(timeoutMs)
    : undefined;
}

export function coerceToolModelConfig(model?: AgentToolModelConfig): ToolModelConfig {
  const primary = resolveAgentModelPrimaryValue(model);
  const fallbacks = resolveAgentModelFallbackValues(model);
  const timeoutMs = resolveAgentModelTimeoutMsValue(model);
  return {
    ...(primary?.trim() ? { primary: primary.trim() } : {}),
    ...(fallbacks.length > 0 ? { fallbacks } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

type ModelConfig = {
  models?: {
    providers?: Record<string, any>;
  };
};

export function resolveDefaultModelRef(cfg?: ModelConfig): { provider: string; model: string } {
  const DEFAULT_PROVIDER = "openai";
  const DEFAULT_MODEL = "gpt-4o";
  return { provider: DEFAULT_PROVIDER, model: DEFAULT_MODEL };
}

function formatProviderModelRef(provider: string, model: string): string {
  return `${provider}/${model}`;
}

export function buildToolModelConfigFromCandidates(params: {
  explicit: ToolModelConfig;
  cfg?: ModelConfig;
  workspaceDir?: string;
  agentDir?: string;
  authStore?: any;
  candidates: Array<string | null | undefined>;
  isProviderConfigured?: (provider: string) => boolean | undefined;
}): ToolModelConfig | null {
  if (hasToolModelConfig(params.explicit)) {
    return params.explicit;
  }

  const deduped: string[] = [];
  for (const candidate of params.candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed || !trimmed.includes("/")) {
      continue;
    }
    const provider = trimmed.slice(0, trimmed.indexOf("/")).trim();
    const providerConfigured =
      params.isProviderConfigured?.(provider) ?? true;
    if (!provider || !providerConfigured) {
      continue;
    }
    if (!deduped.includes(trimmed)) {
      deduped.push(trimmed);
    }
  }

  if (deduped.length === 0) {
    return null;
  }

  return {
    primary: deduped[0],
    ...(deduped.length > 1 ? { fallbacks: deduped.slice(1) } : {}),
    ...(params.explicit.timeoutMs !== undefined ? { timeoutMs: params.explicit.timeoutMs } : {}),
  };
}

export function hasAuthForProvider(_params: {
  provider: string;
  agentDir?: string;
  authStore?: any;
}): boolean {
  return false;
}

export function hasProviderAuthForTool(_params: {
  provider: string;
  cfg?: ModelConfig;
  workspaceDir?: string;
  agentDir?: string;
  authStore?: any;
}): boolean {
  return false;
}
