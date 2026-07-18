// Fast help renderer for setup/onboard/configure without loading full CLI startup.
// 移植自 openclaw/src/cli/setup-onboard-configure-help-fast-path.ts。
//
// 降级策略：
//  - 原模块依赖 `../version.js` 的 `VERSION`、`./program/context.js` 的
//    `ProgramContext`、`./program/help.js` 的 `configureProgramHelp`、
//    `./program/register.setup.js`/`register.onboard.js`/`register.configure.js`。
//    这些模块在 cross-wms 中尚未移植；这里提供降级 `tryOutputSetupOnboardConfigureHelp`
//    stub（始终返回 false），保留函数签名以便未来替换。

import { Command } from "commander";
import { resolveCliArgvInvocation } from "./argv-invocation.js";

type SetupOnboardConfigureHelpCommand = "setup" | "onboard" | "configure";

const SETUP_ONBOARD_CONFIGURE_HELP_COMMANDS = new Set<SetupOnboardConfigureHelpCommand>([
  "setup",
  "onboard",
  "configure",
]);

function resolveSetupOnboardConfigureHelpCommand(
  argv: string[],
): SetupOnboardConfigureHelpCommand | null {
  const invocation = resolveCliArgvInvocation(argv);
  if (invocation.commandPath.length !== 1 || !invocation.hasHelpOrVersion) {
    return null;
  }
  const command = invocation.commandPath[0];
  return SETUP_ONBOARD_CONFIGURE_HELP_COMMANDS.has(command as SetupOnboardConfigureHelpCommand)
    ? (command as SetupOnboardConfigureHelpCommand)
    : null;
}

/**
 * Try to output fast help for setup/onboard/configure commands.
 *
 * 降级实现：openclaw 的 `program/context.js`、`program/help.js`、
 * `program/register.setup.js` 等未移植；这里始终返回 false，
 * 让 Commander 接管。
 */
export async function tryOutputSetupOnboardConfigureHelp(_argv: string[]): Promise<boolean> {
  // 检查命令是否匹配，以保留 resolveSetupOnboardConfigureHelpCommand 的调用。
  const _command = resolveSetupOnboardConfigureHelpCommand(_argv);
  return false;
}

// 保留 Command 引用以避免 unused import 错误。
void Command;
