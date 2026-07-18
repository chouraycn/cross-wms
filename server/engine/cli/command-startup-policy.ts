// Startup policy helpers for config guards, plugin loading, banners, and CLI path checks.
// 移植自 openclaw/src/cli/command-startup-policy.ts。
//
// 降级策略：
//  - 原模块依赖 ../infra/env.js 的 isTruthyEnvValue。降级内联实现。
//  - 原模块依赖 ./command-catalog.js、./command-path-policy.js（均已移植）。

import type { CliCommandPluginLoadPolicy } from "./command-catalog.js";
import { resolveCliCommandPathPolicy } from "./command-path-policy.js";

// ===== 内联 isTruthyEnvValue stub =====
function isTruthyEnvValue(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}
// ===== stub 结束 =====

export function shouldBypassConfigGuardForCommandPath(commandPath: string[]): boolean {
  return resolveCliCommandPathPolicy(commandPath).bypassConfigGuard;
}

function shouldLoadPlugins(params: {
  argv?: string[];
  commandPath: string[];
  jsonOutputMode: boolean;
  loadPlugins: CliCommandPluginLoadPolicy;
}): boolean {
  const loadPlugins = params.loadPlugins;
  if (typeof loadPlugins === "function") {
    return loadPlugins({
      argv: params.argv ?? [],
      commandPath: params.commandPath,
      jsonOutputMode: params.jsonOutputMode,
    });
  }
  return loadPlugins === "always" || (loadPlugins === "text-only" && !params.jsonOutputMode);
}

export function resolveCliStartupPolicy(params: {
  argv?: string[];
  commandPath: string[];
  jsonOutputMode: boolean;
  env?: NodeJS.ProcessEnv;
  routeMode?: boolean;
}) {
  const suppressDoctorStdout = params.jsonOutputMode;
  const commandPolicy = resolveCliCommandPathPolicy(params.commandPath);
  const env = params.env ?? process.env;
  return {
    suppressDoctorStdout,
    hideBanner: isTruthyEnvValue(env.OPENCLAW_HIDE_BANNER) || commandPolicy.hideBanner,
    skipConfigGuard: params.routeMode
      ? commandPolicy.routeConfigGuard === "always" ||
        (commandPolicy.routeConfigGuard === "when-suppressed" && suppressDoctorStdout)
      : false,
    loadPlugins: shouldLoadPlugins({
      argv: params.argv,
      commandPath: params.commandPath,
      jsonOutputMode: params.jsonOutputMode,
      loadPlugins: commandPolicy.loadPlugins,
    }),
    pluginRegistry: commandPolicy.pluginRegistry,
  };
}
