// CLI respawn 跳过策略：针对 help、交互式 TTY 命令和前台 Gateway 运行。
// 移植自 openclaw/src/cli/respawn-policy.ts。
//
// 降级策略：
//  - 原模块依赖 `./argv-invocation.js`（cross-wms 已移植）。
//  - 原模块依赖 `./argv.js`（cross-wms 已移植）。
//  - 此处直接迁移实现，无其他外部依赖。

import { resolveCliArgvInvocation } from "./argv-invocation.js";
import { getCommandPositionalsWithRootOptions } from "./argv.js";

const GATEWAY_RUN_BOOLEAN_FLAGS = [
  "--allow-unconfigured",
  "--claude-cli-logs",
  "--cli-backend-logs",
  "--compact",
  "--dev",
  "--force",
  "--raw-stream",
  "--reset",
  "--tailscale-reset-on-exit",
  "--verbose",
] as const;

const GATEWAY_RUN_VALUE_FLAGS = [
  "--auth",
  "--bind",
  "--password",
  "--password-file",
  "--port",
  "--raw-stream-path",
  "--tailscale",
  "--token",
  "--ws-log",
] as const;

const INTERACTIVE_TTY_COMMANDS = new Set(["tui", "terminal", "chat"]);

export function isInteractiveTtyCommandArgv(argv: string[]): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  return invocation.primary !== null && INTERACTIVE_TTY_COMMANDS.has(invocation.primary);
}

export function isTerminalInteractiveRespawnArgv(argv: string[]): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  if (invocation.hasHelpOrVersion) {
    return false;
  }
  return invocation.primary === null || INTERACTIVE_TTY_COMMANDS.has(invocation.primary);
}

function isForegroundGatewayRunArgv(argv: string[]): boolean {
  const positionals = getCommandPositionalsWithRootOptions(argv, {
    commandPath: ["gateway"],
    booleanFlags: GATEWAY_RUN_BOOLEAN_FLAGS,
    valueFlags: GATEWAY_RUN_VALUE_FLAGS,
  });
  if (!positionals) {
    return false;
  }
  // 前台 gateway 自身拥有 terminal/process 环境；respawn 会为长生命周期服务
  // 增加额外的父进程。
  return positionals.length === 0 || (positionals.length === 1 && positionals[0] === "run");
}

/** 返回 CLI 启动是否应针对该 argv 跳过通用 respawn 包装器。 */
export function shouldSkipRespawnForArgv(argv: string[]): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  return (
    invocation.hasHelpOrVersion ||
    isInteractiveTtyCommandArgv(argv) ||
    (invocation.primary === "gateway" && isForegroundGatewayRunArgv(argv))
  );
}

/** 返回 startup-environment respawn 是否应被跳过，且不抑制 TUI respawn 策略。 */
export function shouldSkipStartupEnvironmentRespawnForArgv(argv: string[]): boolean {
  const invocation = resolveCliArgvInvocation(argv);
  return (
    invocation.hasHelpOrVersion ||
    (invocation.primary === "gateway" && isForegroundGatewayRunArgv(argv))
  );
}
