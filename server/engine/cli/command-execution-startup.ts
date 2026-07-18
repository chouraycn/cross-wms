// CLI startup context, banner/log presentation, and bootstrap orchestration.
// 移植自 openclaw/src/cli/command-execution-startup.ts。
//
// 降级策略：
//  - 原模块依赖 ../config/types.js 的 ConfigFileSnapshot、../logging/console.js 的
//    routeLogsToStderr、../runtime.js 的 RuntimeEnv、./argv-invocation.js（已移植）、
//    ./command-bootstrap.js（已移植）、./command-startup-policy.js（已移植）、
//    ./banner.js（已移植）。
//  - routeLogsToStderr 降级为 no-op。

import { resolveCliArgvInvocation } from "./argv-invocation.js";
import { ensureCliCommandBootstrap } from "./command-bootstrap.js";
import { resolveCliStartupPolicy } from "./command-startup-policy.js";
import type { RuntimeEnv } from "./plugins-command-helpers.js";

// ===== 内联占位类型 =====
type ConfigFileSnapshot = unknown;
// ===== 占位类型结束 =====

// ===== 内联 routeLogsToStderr stub =====
function routeLogsToStderr(): void {
  // 降级 no-op：openclaw 的 logging/console.js 未移植。
}
// ===== stub 结束 =====

type CliStartupPolicy = ReturnType<typeof resolveCliStartupPolicy>;

const hasJsonFlag = (argv: readonly string[]) =>
  argv.some((arg) => arg === "--json" || arg.startsWith("--json="));

const hasVersionFlag = (argv: readonly string[]) =>
  argv.some((arg) => arg === "--version" || arg === "-V");

export function resolveCliExecutionStartupContext(params: {
  argv: string[];
  jsonOutputMode: boolean;
  env?: NodeJS.ProcessEnv;
  routeMode?: boolean;
}) {
  const invocation = resolveCliArgvInvocation(params.argv);
  const { commandPath } = invocation;
  return {
    invocation,
    commandPath,
    startupPolicy: resolveCliStartupPolicy({
      argv: params.argv,
      commandPath,
      jsonOutputMode: params.jsonOutputMode,
      env: params.env,
      routeMode: params.routeMode,
    }),
  };
}

export async function applyCliExecutionStartupPresentation(params: {
  argv?: string[];
  routeLogsToStderrOnSuppress?: boolean;
  startupPolicy: CliStartupPolicy;
  showBanner?: boolean;
  version?: string;
}): Promise<void> {
  if (params.startupPolicy.suppressDoctorStdout && params.routeLogsToStderrOnSuppress !== false) {
    routeLogsToStderr();
  }
  if (params.startupPolicy.hideBanner || params.showBanner === false || !params.version) {
    return;
  }
  if (params.argv && (hasJsonFlag(params.argv) || hasVersionFlag(params.argv))) {
    return;
  }
  const { emitCliBanner } = await import("./banner.js");
  if (params.argv) {
    emitCliBanner(params.version, { argv: params.argv });
    return;
  }
  emitCliBanner(params.version);
}

export async function ensureCliExecutionBootstrap(params: {
  runtime: RuntimeEnv;
  commandPath: string[];
  startupPolicy: CliStartupPolicy;
  allowInvalid?: boolean;
  beforeStateMigrations?: (snapshot?: ConfigFileSnapshot) => Promise<boolean>;
  loadPlugins?: boolean;
  skipConfigGuard?: boolean;
}): Promise<void> {
  await ensureCliCommandBootstrap({
    runtime: params.runtime,
    commandPath: params.commandPath,
    suppressDoctorStdout: params.startupPolicy.suppressDoctorStdout,
    allowInvalid: params.allowInvalid,
    ...(params.beforeStateMigrations
      ? { beforeStateMigrations: params.beforeStateMigrations }
      : {}),
    loadPlugins: params.loadPlugins ?? params.startupPolicy.loadPlugins,
    pluginRegistry: params.startupPolicy.pluginRegistry,
    skipConfigGuard: params.skipConfigGuard ?? params.startupPolicy.skipConfigGuard,
  });
}
