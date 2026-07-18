// Command config resolver that combines secret materialization with optional plugin auto-enable.
// 移植自 openclaw/src/cli/command-config-resolution.ts。
//
// 降级策略：
//  - 原模块依赖 ../config/plugin-auto-enable.js 的 applyPluginAutoEnable、
//    ../config/types.js 的 OpenClawConfig、../runtime.js 的 RuntimeEnv、
//    ./command-secret-gateway.js（已移植，降级版本）。
//  - applyPluginAutoEnable 降级为返回原 config。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";
import type { RuntimeEnv } from "./plugins-command-helpers.js";
import {
  type CommandSecretResolutionMode,
  resolveCommandSecretRefsViaGateway,
} from "./command-secret-gateway.js";

// ===== 内联 applyPluginAutoEnable stub =====
function applyPluginAutoEnable(params: {
  config: OpenClawConfig;
  env: NodeJS.ProcessEnv;
}): { config: OpenClawConfig } {
  // 降级 no-op：openclaw 的 config/plugin-auto-enable.js 未移植。
  void params.env;
  return { config: params.config };
}
// ===== stub 结束 =====

/** Resolve command-scoped secrets and return both raw resolved and effective config views. */
export async function resolveCommandConfigWithSecrets<TConfig extends OpenClawConfig>(params: {
  config: TConfig;
  commandName: string;
  targetIds: Set<string>;
  mode?: CommandSecretResolutionMode;
  allowedPaths?: Set<string>;
  forcedActivePaths?: Set<string>;
  optionalActivePaths?: Set<string>;
  allowLocalExecSecretRefs?: boolean;
  scrubUnresolvedSecretRefs?: boolean;
  runtime?: RuntimeEnv;
  autoEnable?: boolean;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  resolvedConfig: TConfig;
  effectiveConfig: TConfig;
  diagnostics: string[];
}> {
  const { resolvedConfig, diagnostics } = await resolveCommandSecretRefsViaGateway({
    config: params.config,
    commandName: params.commandName,
    targetIds: params.targetIds,
    ...(params.mode ? { mode: params.mode } : {}),
    ...(params.allowedPaths ? { allowedPaths: params.allowedPaths } : {}),
    ...(params.forcedActivePaths ? { forcedActivePaths: params.forcedActivePaths } : {}),
    ...(params.optionalActivePaths ? { optionalActivePaths: params.optionalActivePaths } : {}),
    ...(params.allowLocalExecSecretRefs !== undefined
      ? { allowLocalExecSecretRefs: params.allowLocalExecSecretRefs }
      : {}),
    ...(params.scrubUnresolvedSecretRefs !== undefined
      ? { scrubUnresolvedSecretRefs: params.scrubUnresolvedSecretRefs }
      : {}),
  });
  if (params.runtime) {
    for (const entry of diagnostics) {
      params.runtime.error(`[secrets] ${entry}`);
    }
  }
  const effectiveConfig = params.autoEnable
    ? applyPluginAutoEnable({
        config: resolvedConfig,
        env: params.env ?? process.env,
      }).config
    : resolvedConfig;
  return {
    resolvedConfig: resolvedConfig as TConfig,
    effectiveConfig: effectiveConfig as TConfig,
    diagnostics,
  };
}
