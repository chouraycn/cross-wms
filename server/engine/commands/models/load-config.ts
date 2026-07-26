/** Config loader for model commands with command-scoped secret resolution. */
// 移植自 openclaw/src/commands/models/load-config.ts
//
// 降级说明：
//  - resolveCommandConfigWithSecrets 来自 ../../cli/command-config-resolution.js
//    → cross-wms 已移植（降级版本）
//  - RuntimeEnv 来自 ../../runtime.js → cross-wms 未移植 runtime.ts，
//    改从 ../../cli/plugins-command-helpers.js 导入等价类型（{ log, error }）
//  - getRuntimeConfig / getRuntimeConfigSourceSnapshot / setRuntimeConfigSnapshot /
//    OpenClawConfig / getModelsCommandSecretTargetIds 来自 ./load-config.runtime.js
//    → cross-wms 已移植
import { resolveCommandConfigWithSecrets } from "../../cli/command-config-resolution.js";
import type { RuntimeEnv } from "../../cli/plugins-command-helpers.js";
import {
  getModelsCommandSecretTargetIds,
  getRuntimeConfig,
  getRuntimeConfigSourceSnapshot,
  setRuntimeConfigSnapshot,
  type OpenClawConfig,
} from "./load-config.runtime.js";

/** Source and resolved config pair returned by model command config loading. */
export type LoadedModelsConfig = {
  sourceConfig: OpenClawConfig;
  resolvedConfig: OpenClawConfig;
  diagnostics: string[];
};

/** Loads config, resolves model command secrets, and preserves the source snapshot. */
export async function loadModelsConfigWithSource(params: {
  commandName: string;
  runtime?: RuntimeEnv;
}): Promise<LoadedModelsConfig> {
  const runtimeConfig = getRuntimeConfig();
  const pinnedSourceConfig = getRuntimeConfigSourceSnapshot();
  const sourceConfig = pinnedSourceConfig ?? runtimeConfig;
  const { resolvedConfig, diagnostics } = await resolveCommandConfigWithSecrets({
    config: runtimeConfig,
    commandName: params.commandName,
    targetIds: getModelsCommandSecretTargetIds(),
    runtime: params.runtime,
  });
  // Keep the original source snapshot pinned so later config writes do not
  // accidentally serialize already-resolved secret values.
  setRuntimeConfigSnapshot(resolvedConfig, sourceConfig);
  return {
    sourceConfig,
    resolvedConfig,
    diagnostics,
  };
}

/** Loads the resolved model command config when callers do not need source metadata. */
export async function loadModelsConfig(params: {
  commandName: string;
  runtime?: RuntimeEnv;
}): Promise<OpenClawConfig> {
  return (await loadModelsConfigWithSource(params)).resolvedConfig;
}
