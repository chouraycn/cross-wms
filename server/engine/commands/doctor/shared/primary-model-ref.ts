// @ts-nocheck
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "@openclaw-src/agents/defaults.js";
import { parseModelRef } from "@openclaw-src/agents/model-selection-normalize.js";
import { resolveAgentModelPrimaryValue } from "@openclaw-src/config/model-input.js";
import type { AgentModelConfig } from "@openclaw-src/config/types.agents-shared.js";
import type { OpenClawConfig } from "@openclaw-src/config/types.openclaw.js";

export function resolveDoctorPrimaryModelRef(
  cfg: OpenClawConfig,
  agentModel?: AgentModelConfig,
): { provider: string; model: string } {
  const raw =
    resolveAgentModelPrimaryValue(agentModel) ??
    resolveAgentModelPrimaryValue(cfg.agents?.defaults?.model) ??
    DEFAULT_MODEL;
  return (
    parseModelRef(raw, DEFAULT_PROVIDER, { allowPluginNormalization: false }) ?? {
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
    }
  );
}
