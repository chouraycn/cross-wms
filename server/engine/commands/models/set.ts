/** Command for setting the default text model. */
import { logConfigUpdated } from "@openclaw-src/config/logging.js";
import { resolveAgentModelPrimaryValue } from "@openclaw-src/config/model-input.js";
import type { RuntimeEnv } from "@openclaw-src/runtime.js";
import { repairCodexRuntimePluginInstallForModelSelection } from "@openclaw-src/codex-runtime-plugin-install.js";
import { repairCopilotRuntimePluginInstallForModelSelection } from "@openclaw-src/copilot-runtime-plugin-install.js";
import { applyDefaultModelPrimaryUpdate, updateConfig } from "./shared.js";

/** Sets agents.defaults.model.primary and repairs provider runtime plugin installs when needed. */
export async function modelsSetCommand(modelRaw: string, runtime: RuntimeEnv) {
  const updated = await updateConfig((cfg, context) => {
    return applyDefaultModelPrimaryUpdate({
      cfg,
      resolveCfg: context.runtimeConfig,
      modelRaw,
      field: "model",
    });
  });
  const selectedModel = resolveAgentModelPrimaryValue(updated.agents?.defaults?.model) ?? modelRaw;
  const repaired = await repairCodexRuntimePluginInstallForModelSelection({
    cfg: updated,
    model: selectedModel,
  });
  const copilotRepaired = await repairCopilotRuntimePluginInstallForModelSelection({
    cfg: updated,
    model: selectedModel,
  });
  const warnings = [...repaired.warnings, ...copilotRepaired.warnings];
  for (const warning of warnings) {
    runtime.error?.(warning);
  }

  logConfigUpdated(runtime);
  runtime.log(`Default model: ${selectedModel}`);
}
