// `openclaw gateway ...` 快速路径 argv 解析器；避免完整 Commander 注册即可识别 gateway 命令。
// 移植自 openclaw/src/cli/gateway-run-argv.ts。
//
// 降级策略：原模块仅依赖 ../infra/cli-root-options.js（已移植为 ./cli-root-options.ts），
// 此处直接迁移实现。

import { consumeRootOptionToken, isValueToken } from "./cli-root-options.js";

const GATEWAY_RUN_VALUE_FLAGS = new Set([
  "--port",
  "--bind",
  "--token",
  "--token-file",
  "--auth",
  "--password",
  "--password-file",
  "--tailscale",
  "--ws-log",
  "--raw-stream-path",
]);

const GATEWAY_RUN_BOOLEAN_FLAGS = new Set([
  "--tailscale-reset-on-exit",
  "--allow-unconfigured",
  "--dev",
  "--reset",
  "--force",
  "--verbose",
  "--cli-backend-logs",
  "--claude-cli-logs",
  "--compact",
  "--raw-stream",
]);

/** 返回 gateway-run 选项在 argv 中占用多少个 token，未识别返回 0。 */
export function consumeGatewayRunOptionToken(args: ReadonlyArray<string>, index: number): number {
  const arg = args[index];
  if (!arg || arg === "--" || !arg.startsWith("-")) {
    return 0;
  }
  const equalsIndex = arg.indexOf("=");
  const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
  if (GATEWAY_RUN_BOOLEAN_FLAGS.has(flag)) {
    return equalsIndex === -1 ? 1 : 0;
  }
  if (!GATEWAY_RUN_VALUE_FLAGS.has(flag)) {
    return 0;
  }
  if (equalsIndex !== -1) {
    return arg.slice(equalsIndex + 1).trim() ? 1 : 0;
  }
  return isValueToken(args[index + 1]) ? 2 : 0;
}

function consumeGatewayRunPreBootstrapOptionToken(
  args: ReadonlyArray<string>,
  index: number,
): number {
  const consumed = consumeGatewayRunOptionToken(args, index);
  if (consumed > 0) {
    return consumed;
  }
  const arg = args[index];
  if (arg && GATEWAY_RUN_VALUE_FLAGS.has(arg) && args[index + 1] !== undefined) {
    // Commander 之后会拒绝 option-like 的必填值。此处先消费，避免畸形输入意外触发危险 flag。
    return 2;
  }
  return 0;
}

/** 返回 `gateway` 命令之前根快速路径 token 的消费数。 */
export function consumeGatewayFastPathRootOptionToken(
  args: ReadonlyArray<string>,
  index: number,
): number {
  const arg = args[index];
  if (!arg || arg === "--") {
    return 0;
  }
  if (arg === "--no-color") {
    return 1;
  }
  if (arg.startsWith("--profile=")) {
    return arg.slice("--profile=".length).trim() ? 1 : 0;
  }
  if (arg === "--profile") {
    return isValueToken(args[index + 1]) ? 2 : 0;
  }
  return 0;
}

function resolveGatewayCommandStart(argv: string[]): {
  args: string[];
  startIndex: number;
} | null {
  const args = argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg || arg === "--") {
      return null;
    }
    const consumed = consumeRootOptionToken(args, index);
    if (consumed > 0) {
      index += consumed - 1;
      continue;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    return arg === "gateway" ? { args, startIndex: index + 1 } : null;
  }
  return null;
}

/** 从原始 argv 解析 gateway 命令路径，用于 catalog/policy 查找。 */
export function resolveGatewayCatalogCommandPath(argv: string[]): string[] | null {
  const gateway = resolveGatewayCommandStart(argv);
  if (!gateway) {
    return null;
  }
  for (let index = gateway.startIndex; index < gateway.args.length; index += 1) {
    const arg = gateway.args[index];
    if (!arg || arg === "--") {
      break;
    }
    const consumed = consumeGatewayRunOptionToken(gateway.args, index);
    if (consumed > 0) {
      index += consumed - 1;
      continue;
    }
    if (arg.startsWith("-")) {
      continue;
    }
    return ["gateway", arg];
  }

  return ["gateway"];
}

/** 在 Commander 注册之前解析 destructive gateway-run flag。 */
export function resolveGatewayRunPreBootstrapOptions(
  argv: string[],
): { force: boolean; reset: boolean } | null {
  const gateway = resolveGatewayCommandStart(argv);
  if (!gateway) {
    return null;
  }
  let force = false;
  let reset = false;
  let sawRun = false;

  for (let index = gateway.startIndex; index < gateway.args.length; index += 1) {
    const arg = gateway.args[index];
    if (!arg || arg === "--") {
      break;
    }
    if (!sawRun && arg === "run") {
      sawRun = true;
      continue;
    }
    const consumed = consumeGatewayRunPreBootstrapOptionToken(gateway.args, index);
    if (consumed > 0) {
      if (arg === "--force") {
        force = true;
      } else if (arg === "--reset") {
        reset = true;
      }
      index += consumed - 1;
      continue;
    }
    if (arg === "--force") {
      force = true;
    } else if (arg === "--reset") {
      reset = true;
    }
    if (!arg.startsWith("-")) {
      return null;
    }
  }

  return { force, reset };
}
