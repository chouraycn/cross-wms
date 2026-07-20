// Main CLI entry orchestration: fast paths, env setup, plugin aliases, and Commander dispatch.
// 移植自 openclaw/src/cli/run-main.ts。
//
// 降级策略：
//  - 原模块依赖大量未移植的 openclaw 内部模块：
//    `@openclaw/normalization-core/string-coerce`、`../config/paths.js`、
//    `../config/types.openclaw.js`、`../infra/cli-root-options.js`、
//    `../infra/env.js`、`../infra/net/proxy/proxy-lifecycle.js`、
//    `../infra/path-env.js`、`../infra/runtime-guard.js`、
//    `../plugins/manifest-command-aliases.js`、`./gateway-run-argv.js`、
//    `./json-output-mode.js`、`./profile.js`、`./program/command-suggestions.js`、
//    `./program/core-command-descriptors.js`、`./program/subcli-descriptors.js`、
//    `./container-target.js`、`./windows-argv.js`、`./startup-trace.js`、
//    `./command-registration-policy.js` 等。
//  - 这里提供降级实现：
//    * re-export `run-main-policy.js` 的 fast-path 检查函数（已移植）。
//    * `isGatewayRunFastPathArgv` 始终返回 false（gateway-run-argv 未移植）。
//    * `shouldStartOnboardingForFreshInstall` 始终返回 false（config 未移植）。
//    * `resolveMissingPluginCommandMessage` re-export 自 `run-main-policy.js`。
//    * `runCli` 抛出 "not supported" 错误，保留函数签名。
//  - 保留所有导出名称与签名以便未来替换为正式实现。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";

// re-export 已移植的 fast-path 检查函数（与原模块 line 56-68 一致）。
export {
  resolvePrecomputedSubcommandHelpFastPath,
  rewriteUpdateFlagArgv,
  shouldEnsureCliPath,
  shouldStartCrestodianForBareRoot,
  shouldStartCrestodianForModernOnboard,
  shouldStartProxyForCli,
  shouldUseBrowserHelpFastPath,
  shouldUseNodesHelpFastPath,
  shouldUseRootHelpFastPath,
  shouldUseSecretsHelpFastPath,
  shouldUseSetupOnboardConfigureHelpFastPath,
} from "./run-main-policy.js";

// re-export resolveMissingPluginCommandMessage 的降级实现（与原模块 line 305-315 一致）。
export { resolveMissingPluginCommandMessage } from "./run-main-policy.js";

// 引用以避免 unused import 警告（OpenClawConfig 用于类型签名兼容）。
void (undefined as unknown as OpenClawConfig);

/**
 * Detect whether argv invokes a gateway run fast path.
 *
 * 降级实现：openclaw 的 `./gateway-run-argv.js`、`./argv-invocation.js`
 * 中的 `consumeGatewayFastPathRootOptionToken`/`consumeGatewayRunOptionToken`/
 * `resolveGatewayCatalogCommandPath` 未移植；这里始终返回 false，
 * 保留函数签名以便未来替换为正式实现。
 */
export function isGatewayRunFastPathArgv(_argv: string[]): boolean {
  return false;
}

/**
 * Decide whether to start onboarding for a fresh install.
 *
 * 降级实现：openclaw 的 `../config/config.js` 的 `readConfigFileSnapshot`
 * 未移植；这里始终返回 false（不启动 onboarding），
 * 保留函数签名以便未来替换为正式实现。
 */
export async function shouldStartOnboardingForFreshInstall(_argv: string[]): Promise<boolean> {
  return false;
}

/**
 * Main CLI entry point.
 *
 * 降级实现：openclaw 的 run-main.ts 依赖大量未移植的子系统
 * （config/paths、config/types.openclaw、infra/cli-root-options、infra/env、
 * infra/net/proxy、infra/path-env、infra/runtime-guard、
 * plugins/manifest-command-aliases、gateway-cli/run-command、
 * program/build-program、program/root-help、program/core-command-descriptors、
 * program/subcli-descriptors、commands/onboard、crestodian、tui 等）；
 * 这里抛出 "not supported" 错误，保留函数签名以便未来替换为正式实现。
 */
export async function runCli(_argv: string[] = process.argv): Promise<void> {
  console.error('runCli is not available in cross-wms');
      process.exit(1);
}
