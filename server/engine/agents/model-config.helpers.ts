/**
 * 移植自 openclaw/src/agents/tools/model-config.helpers.ts
 *
 * cross-wms 降级实现：工具模型配置和认证辅助函数的简化版本。
 * 不依赖完整的 OpenClaw 认证/配置基础设施。
 */

export type ToolModelConfig = { primary?: string; fallbacks?: string[]; timeoutMs?: number };

export function hasToolModelConfig(model: ToolModelConfig | undefined): boolean {
  return Boolean(
    model?.primary?.trim() || (model?.fallbacks ?? []).some((entry) => entry.trim().length > 0),
  );
}

export function resolveDefaultModelRef(cfg?: unknown): { provider: string; model: string } {
  // Default to anthropic/claude as fallback
  return { provider: "anthropic", model: "claude-sonnet-4-20250514" };
}

export function hasAuthForProvider(params: {
  provider: string;
  agentDir?: string;
  authStore?: unknown;
}): boolean {
  // Simplified: check for common env var patterns
  const envKeyMap: Record<string, string[]> = {
    anthropic: ["ANTHROPIC_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  };
  const keys = envKeyMap[params.provider] ?? [];
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

export function hasAuthProfileForProvider(params: {
  provider: string;
  agentDir?: string;
  authStore?: unknown;
  includeExternalCli?: boolean;
  type?: string;
}): boolean {
  return hasAuthForProvider(params);
}

export function hasProviderAuthForTool(params: {
  provider: string;
  cfg?: unknown;
  workspaceDir?: string;
  agentDir?: string;
  authStore?: unknown;
}): boolean {
  return hasAuthForProvider(params);
}

export function hasDirectProviderApiKeyAuthForTool(params: {
  provider: string;
  cfg?: unknown;
  workspaceDir?: string;
  agentDir?: string;
  authStore?: unknown;
  modelApi?: string;
}): boolean {
  // Check for direct API key env vars
  const envKeyMap: Record<string, string[]> = {
    anthropic: ["ANTHROPIC_API_KEY"],
    openai: ["OPENAI_API_KEY"],
    google: ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
  };
  const keys = envKeyMap[params.provider] ?? [];
  return keys.some((key) => Boolean(process.env[key]?.trim()));
}

export function resolveOpenAiImageMediaCandidate(params: {
  cfg?: unknown;
  workspaceDir?: string;
  agentDir: string;
  authStore?: unknown;
  openAiModel: string;
  codexModel?: string;
}): { kind: "keep" | "substitute" | "drop"; ref?: string; provider?: string } {
  const openAiModel = params.openAiModel?.trim();
  if (!openAiModel) {
    return { kind: "drop" };
  }
  if (
    hasDirectProviderApiKeyAuthForTool({
      provider: "openai",
      cfg: params.cfg,
      workspaceDir: params.workspaceDir,
      agentDir: params.agentDir,
      authStore: params.authStore,
    })
  ) {
    return {
      kind: "keep",
      ref: `openai/${openAiModel}`,
    };
  }
  return { kind: "drop" };
}

export function coerceToolModelConfig(model?: unknown): ToolModelConfig {
  if (!model || typeof model !== "object") {
    return {};
  }
  const m = model as Record<string, unknown>;
  const primary = typeof m.primary === "string" ? m.primary.trim() : undefined;
  const fallbacks = Array.isArray(m.fallbacks)
    ? m.fallbacks.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : undefined;
  const timeoutMs = typeof m.timeoutMs === "number" && Number.isFinite(m.timeoutMs) ? m.timeoutMs : undefined;
  return {
    ...(primary ? { primary } : {}),
    ...(fallbacks && fallbacks.length > 0 ? { fallbacks } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  };
}

export function buildToolModelConfigFromCandidates(params: {
  explicit: ToolModelConfig;
  cfg?: unknown;
  workspaceDir?: string;
  agentDir?: string;
  authStore?: unknown;
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
      params.isProviderConfigured?.(provider) ??
      hasProviderAuthForTool({
        provider,
        cfg: params.cfg,
        workspaceDir: params.workspaceDir,
        agentDir: params.agentDir,
        authStore: params.authStore,
      });
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
