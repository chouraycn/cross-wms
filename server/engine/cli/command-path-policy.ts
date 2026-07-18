// Resolves CLI command path policy from the declarative command catalog.
// 移植自 openclaw/src/cli/command-path-policy.ts。
//
// 降级策略：
//  - 原模块依赖 ../gateway/explicit-connection-policy.js 的
//    isGatewayConfigBypassCommandPath。cross-wms 未移植；降级为返回 false。
//  - 原模块依赖 ./argv.js、./command-catalog.js、./command-path-matches.js、
//    ./gateway-run-argv.js（均已移植）。
//  - 此处对 isGatewayConfigBypassCommandPath 内联降级实现（始终返回 false）。

import { getCommandPathWithRootOptions } from "./argv.js";
import {
  cliCommandCatalog,
  type CliCommandPathPolicy,
  type CliNetworkProxyPolicy,
} from "./command-catalog.js";
import { matchesCommandPath } from "./command-path-matches.js";
import { resolveGatewayCatalogCommandPath } from "./gateway-run-argv.js";

// ===== 内联 isGatewayConfigBypassCommandPath stub =====
function isGatewayConfigBypassCommandPath(_commandPath: string[]): boolean {
  // 降级：openclaw 的 gateway/explicit-connection-policy.js 未移植。
  return false;
}
// ===== stub 结束 =====

const DEFAULT_CLI_COMMAND_PATH_POLICY: CliCommandPathPolicy = {
  bypassConfigGuard: false,
  routeConfigGuard: "never",
  loadPlugins: "never",
  pluginRegistry: { scope: "all" },
  hideBanner: false,
  ensureCliPath: true,
  networkProxy: "default",
};

export function resolveCliCommandPathPolicy(commandPath: string[]): CliCommandPathPolicy {
  const resolvedPolicy: CliCommandPathPolicy = { ...DEFAULT_CLI_COMMAND_PATH_POLICY };
  for (const entry of cliCommandCatalog) {
    if (!entry.policy) {
      continue;
    }
    if (!matchesCommandPath(commandPath, entry.commandPath, { exact: entry.exact })) {
      continue;
    }
    Object.assign(resolvedPolicy, entry.policy);
  }
  if (isGatewayConfigBypassCommandPath(commandPath)) {
    resolvedPolicy.bypassConfigGuard = true;
  }
  return resolvedPolicy;
}

function isCommandPathPrefix(commandPath: string[], pattern: readonly string[]): boolean {
  return pattern.every((segment, index) => commandPath[index] === segment);
}

export function resolveCliCatalogCommandPath(argv: string[]): string[] {
  const tokens =
    resolveGatewayCatalogCommandPath(argv) ?? getCommandPathWithRootOptions(argv, argv.length);
  if (tokens.length === 0) {
    return [];
  }
  let bestMatch: readonly string[] | null = null;
  for (const entry of cliCommandCatalog) {
    if (!isCommandPathPrefix(tokens, entry.commandPath)) {
      continue;
    }
    if (!bestMatch || entry.commandPath.length > bestMatch.length) {
      bestMatch = entry.commandPath;
    }
  }
  return bestMatch ? [...bestMatch] : [tokens[0]!];
}

export function resolveCliNetworkProxyPolicy(argv: string[]): CliNetworkProxyPolicy {
  const commandPath = resolveCliCatalogCommandPath(argv);
  const networkProxy = resolveCliCommandPathPolicy(commandPath).networkProxy;
  return typeof networkProxy === "function" ? networkProxy({ argv, commandPath }) : networkProxy;
}
