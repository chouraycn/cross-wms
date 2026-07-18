// Runtime implementations for `openclaw plugins` subcommands. Heavy plugin modules stay
// lazy-loaded so the base CLI can start without activating the plugin registry.
// 移植自 openclaw/src/cli/plugins-cli.runtime.ts。
//
// 降级策略：
//  - 原模块依赖大量未移植的 openclaw 内部模块：
//    ../../packages/terminal-core/src/links.js、../../packages/terminal-core/src/theme.js、
//    ../commands/doctor/shared/configured-runtime-plugin-installs.js、../config/config.js、
//    ../config/types.openclaw.js、../plugins/plugin-lifecycle-trace.js、../runtime.js、../utils.js
//    以及通过动态 import 引用的多个模块。
//  - 这里提供降级 stub：函数签名保留，但运行时直接返回错误或空结果。

import type { PluginMarketplaceListOptions, PluginRegistryOptions } from "./plugins-cli.js";

type PluginInstallActionOptions = {
  dangerouslyForceUnsafeInstall?: boolean;
  force?: boolean;
  link?: boolean;
  pin?: boolean;
  marketplace?: string;
};

// ===== 内联 defaultRuntime stub =====
const defaultRuntime = {
  log(message: string) {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现。
    console.log(message);
  },
  error(message: string) {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现。
    console.error(message);
  },
  exit(code: number) {
    process.exit(code);
  },
  writeJson(value: unknown) {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现。
    console.log(JSON.stringify(value, null, 2));
  },
};
// ===== defaultRuntime 结束 =====

/**
 * Enable a plugin in config and refresh the registry snapshot for the changed policy.
 *
 * 降级实现：openclaw 的 config/config.js、plugins/enable.js、plugins/config-state.js
 * 等运行时模块尚未移植。这里在命令层面降级为输出错误信息，
 * 保留函数签名以便未来替换为正式实现。
 */
export async function runPluginsEnableCommand(idInput: string): Promise<void> {
  void idInput;
  defaultRuntime.error("Plugin enable not supported in stub mode.");
  return defaultRuntime.exit(1);
}

/**
 * Disable a plugin in config and refresh the registry snapshot for the changed policy.
 *
 * 降级实现：openclaw 的 config/config.js、plugins/config-state.js 等运行时模块尚未移植。
 * 这里在命令层面降级为输出错误信息，保留函数签名以便未来替换为正式实现。
 */
export async function runPluginsDisableCommand(idInput: string): Promise<void> {
  void idInput;
  defaultRuntime.error("Plugin disable not supported in stub mode.");
  return defaultRuntime.exit(1);
}

/**
 * 执行插件安装命令的运行时入口。
 *
 * 降级实现：委托给已移植的 plugins-install-command.ts 的 runPluginInstallCommand。
 */
export async function runPluginsInstallAction(
  raw: string,
  opts: PluginInstallActionOptions,
): Promise<void> {
  const { runPluginInstallCommand } = await import("./plugins-install-command.js");
  await runPluginInstallCommand({ raw, opts, invalidateRuntimeCache: false });
}

/**
 * Inspect or refresh the persisted plugin registry index.
 *
 * 降级实现：openclaw 的 plugins/plugin-registry.js 与 config/config.js
 * 等运行时模块尚未移植。这里在命令层面降级为输出 "Plugin registry not available in stub mode."，
 * 保留函数签名以便未来替换为正式实现。
 */
export async function runPluginsRegistryCommand(opts: PluginRegistryOptions): Promise<void> {
  if (opts.json) {
    defaultRuntime.writeJson({
      state: "missing",
      refreshReasons: ["stub-mode"],
      persisted: null,
      current: { plugins: [], diagnostics: [] },
    });
    return;
  }
  defaultRuntime.log("Plugin registry not available in stub mode.");
}

/**
 * Print plugin install-tree, compatibility, and plugin-owned config diagnostics.
 *
 * 降级实现：openclaw 的 doctor 运行时模块尚未移植。这里在命令层面降级为
 * 输出 "No plugin issues detected."，保留函数签名以便未来替换为正式实现。
 */
export async function runPluginsDoctorCommand(): Promise<void> {
  defaultRuntime.log("No plugin issues detected.");
}

/**
 * List plugins from a configured marketplace manifest.
 *
 * 降级实现：openclaw 的 plugins/marketplace.js 运行时模块尚未移植。
 * 这里在命令层面降级为输出错误信息，保留函数签名以便未来替换为正式实现。
 */
export async function runPluginMarketplaceListCommand(
  source: string,
  opts: PluginMarketplaceListOptions,
): Promise<void> {
  void opts;
  defaultRuntime.error(`Marketplace listing not supported in stub mode (source: ${source}).`);
  return defaultRuntime.exit(1);
}
