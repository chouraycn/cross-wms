// Main CLI startup policy helpers for fast paths, proxy startup, aliases, and missing commands.
// 移植自 openclaw/src/cli/run-main-policy.ts。
//
// 降级策略：
//  - 原模块依赖 `@openclaw/normalization-core/string-coerce`、
//    `../config/types.openclaw.js`、`../plugins/manifest-command-aliases.js`、
//    `./argv-invocation.js`、`./argv.js`、`./command-path-policy.js`、
//    `./command-registration-policy.js`、`./precomputed-help.js`、
//    `./program/core-command-descriptors.js`、`./program/subcli-descriptors.js`。
//    其中 `config/types.openclaw.js`、`plugins/manifest-command-aliases.js`、
//    `precomputed-help.js`、`program/core-command-descriptors.js`、
//    `program/subcli-descriptors.js` 未移植。
//  - 这里提供降级实现：fast-path 检查函数返回保守值（false/空），
//    `resolveMissingPluginCommandMessage` 返回 null，保留函数签名。

import {
  normalizeLowercaseStringOrEmpty,
  normalizeOptionalLowercaseString,
} from "../infra/string-coerce.js";
import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";
import { resolveCliArgvInvocation } from "./argv-invocation.js";
import { hasFlag } from "./argv.js";

// ===== 内联降级：command-path-policy stubs =====
function resolveCliCommandPathPolicy(_commandPath: string[]): { ensureCliPath: boolean } {
  return { ensureCliPath: false };
}
function resolveCliNetworkProxyPolicy(_argv: string[]): "default" | "skip" {
  return "skip";
}
// ===== command-path-policy 结束 =====

// ===== 内联降级：command-registration-policy stub =====
function isReservedNonPluginCommandRoot(_value: string): boolean {
  return false;
}
// ===== command-registration-policy 结束 =====

// ===== 内联降级：precomputed-help stub =====
function resolvePrecomputedSubcommandHelpCommand(_argv: string[]): string | null {
  return null;
}
// ===== precomputed-help 结束 =====

// ===== 内联降级：program descriptors stubs =====
function getCoreCliParentDefaultHelpCommands(): string[] {
  return [];
}
function getSubCliParentDefaultHelpCommands(): string[] {
  return [];
}
// ===== program descriptors 结束 =====

const ROOT_HELP_ALIASES = new Set(["tools"]);
const SETUP_ONBOARD_CONFIGURE_HELP_COMMANDS = new Set(["setup", "onboard", "configure"]);
const BARE_PARENT_DEFAULT_HELP_COMMANDS = new Set([
  ...getCoreCliParentDefaultHelpCommands(),
  ...getSubCliParentDefaultHelpCommands(),
]);

function hasHelpFlag(argv: string[]): boolean {
  return hasFlag(argv, "-h") || hasFlag(argv, "--help");
}

function isBareParentDefaultHelpArgv(argv: string[]): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  const [primary, extra] = invocation.commandPath;
  return !invocation.hasHelpOrVersion && primary !== undefined && extra === undefined
    ? BARE_PARENT_DEFAULT_HELP_COMMANDS.has(primary)
    : false;
}

export function rewriteUpdateFlagArgv(argv: string[]): string[] {
  const index = argv.indexOf("--update");
  if (index === -1) {
    return argv;
  }
  const next = [...argv];
  next.splice(index, 1, "update");
  return next;
}

export function shouldEnsureCliPath(argv: string[]): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  if (
    invocation.hasHelpOrVersion ||
    shouldStartCrestodianForBareRoot(argv) ||
    isBareParentDefaultHelpArgv(argv)
  ) {
    return false;
  }
  return resolveCliCommandPathPolicy(invocation.commandPath).ensureCliPath;
}

export function shouldUseRootHelpFastPath(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  return (
    env.OPENCLAW_DISABLE_CLI_STARTUP_HELP_FAST_PATH !== "1" &&
    (invocation.isRootHelpInvocation ||
      (invocation.commandPath.length === 1 &&
        ROOT_HELP_ALIASES.has(invocation.commandPath[0] ?? "") &&
        invocation.hasHelpOrVersion) ||
      (invocation.commandPath.length === 1 &&
        invocation.commandPath[0] === "help" &&
        invocation.hasHelpOrVersion))
  );
}

export function shouldUseBrowserHelpFastPath(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.OPENCLAW_DISABLE_CLI_STARTUP_HELP_FAST_PATH === "1") {
    return false;
  }
  const invocation = resolveCliArgvInvocation(argv);
  return (
    invocation.commandPath.length === 1 &&
    invocation.commandPath[0] === "browser" &&
    hasHelpFlag(argv)
  );
}

export function shouldUseSecretsHelpFastPath(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.OPENCLAW_DISABLE_CLI_STARTUP_HELP_FAST_PATH === "1") {
    return false;
  }
  const invocation = resolveCliArgvInvocation(argv);
  return (
    invocation.commandPath.length === 1 &&
    invocation.commandPath[0] === "secrets" &&
    hasHelpFlag(argv)
  );
}

export function shouldUseNodesHelpFastPath(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.OPENCLAW_DISABLE_CLI_STARTUP_HELP_FAST_PATH === "1") {
    return false;
  }
  const invocation = resolveCliArgvInvocation(argv);
  return (
    invocation.commandPath.length === 1 &&
    invocation.commandPath[0] === "nodes" &&
    hasHelpFlag(argv)
  );
}

export function shouldUseSetupOnboardConfigureHelpFastPath(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.OPENCLAW_DISABLE_CLI_STARTUP_HELP_FAST_PATH === "1") {
    return false;
  }
  const invocation = resolveCliArgvInvocation(argv);
  return (
    invocation.commandPath.length === 1 &&
    SETUP_ONBOARD_CONFIGURE_HELP_COMMANDS.has(invocation.commandPath[0] ?? "") &&
    invocation.hasHelpOrVersion
  );
}

export function resolvePrecomputedSubcommandHelpFastPath(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env.OPENCLAW_DISABLE_CLI_STARTUP_HELP_FAST_PATH === "1") {
    return null;
  }
  return resolvePrecomputedSubcommandHelpCommand(argv);
}

export function shouldStartCrestodianForBareRoot(argv: string[]): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  return invocation.commandPath.length === 0 && !invocation.hasHelpOrVersion;
}

export function shouldStartCrestodianForModernOnboard(argv: string[]): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  return (
    invocation.commandPath[0] === "onboard" &&
    argv.includes("--modern") &&
    !invocation.hasHelpOrVersion
  );
}

export function shouldStartProxyForCli(argv: string[]): boolean {
  const policyArgv = rewriteUpdateFlagArgv(argv);
  const invocation = resolveCliArgvInvocation(policyArgv);
  const [primary] = invocation.commandPath;
  if (invocation.hasHelpOrVersion || !primary) {
    return false;
  }
  if (isBareParentDefaultHelpArgv(policyArgv)) {
    return false;
  }
  return resolveCliNetworkProxyPolicy(policyArgv) === "default";
}

/**
 * Resolve a missing plugin command message.
 *
 * 降级实现：openclaw 的 `plugins/manifest-command-aliases.js` 未移植；
 *    这里返回 null（表示无法给出有用的提示），保留函数签名。
 */
export function resolveMissingPluginCommandMessage(
  pluginId: string,
  _config?: OpenClawConfig,
  _options?: {
    registry?: unknown;
    resolveCommandAliasOwner?: (params: unknown) => unknown;
    resolveToolOwner?: (params: unknown) => unknown;
    resolveCliCommandSurfaceOwner?: (params: unknown) => unknown;
  },
): string | null {
  const normalizedPluginId = normalizeLowercaseStringOrEmpty(pluginId);
  if (!normalizedPluginId) {
    return null;
  }
  if (isReservedNonPluginCommandRoot(normalizedPluginId)) {
    return null;
  }
  // openclaw 的 manifest-command-aliases 未移植；无法判断 plugin 归属。
  return null;
}

// 保留 normalizeOptionalLowercaseString 引用以避免 unused import。
void normalizeOptionalLowercaseString;
