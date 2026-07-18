// Decides which built-in and plugin commands need registration for one CLI invocation.
// 移植自 openclaw/src/cli/command-registration-policy.ts。
//
// 降级策略：
//  - 原模块依赖 ../infra/env.js 的 isTruthyEnvValue。降级内联实现。
//  - 原模块依赖 ./argv-invocation.js（已移植）。

import { resolveCliArgvInvocation } from "./argv-invocation.js";

// ===== 内联 isTruthyEnvValue stub =====
function isTruthyEnvValue(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "TRUE" || value === "yes";
}
// ===== stub 结束 =====

const RESERVED_NON_PLUGIN_COMMAND_ROOTS = new Set(["auth", "tool", "tools"]);

export function isReservedNonPluginCommandRoot(primary: string | null | undefined): boolean {
  return typeof primary === "string" && RESERVED_NON_PLUGIN_COMMAND_ROOTS.has(primary);
}

export function shouldRegisterPrimaryCommandOnly(argv: string[]): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  return invocation.primary !== null || !invocation.hasHelpOrVersion;
}

export function shouldSkipPluginCommandRegistration(params: {
  argv: string[];
  primary: string | null;
  hasBuiltinPrimary: boolean;
}): boolean {
  const invocation = resolveCliArgvInvocation(params.argv);
  if (params.primary === "help") {
    return invocation.hasHelpOrVersion && invocation.commandPath.length <= 1;
  }
  if (invocation.hasHelpOrVersion) {
    return (
      !params.primary || params.hasBuiltinPrimary || isReservedNonPluginCommandRoot(params.primary)
    );
  }
  if (params.hasBuiltinPrimary) {
    return true;
  }
  if (!params.primary) {
    return invocation.hasHelpOrVersion;
  }
  if (isReservedNonPluginCommandRoot(params.primary)) {
    return true;
  }
  return false;
}

export function shouldEagerRegisterSubcommands(env: NodeJS.ProcessEnv = process.env): boolean {
  return isTruthyEnvValue(env.OPENCLAW_DISABLE_LAZY_SUBCOMMANDS);
}

export function shouldRegisterPrimarySubcommandOnly(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return !shouldEagerRegisterSubcommands(env) && shouldRegisterPrimaryCommandOnly(argv);
}
