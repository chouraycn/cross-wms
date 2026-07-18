// Plugin uninstall command implementation and confirmation-driven removal plan execution.
// 移植自 openclaw/src/cli/plugins-uninstall-command.ts。
//
// 降级策略：
//  - 原模块依赖大量未移植的 openclaw 内部模块：
//    ../../packages/terminal-core/src/theme.js、../config/config.js、../config/paths.js、
//    ../config/types.openclaw.js、../plugins/plugin-lifecycle-trace.js、../runtime.js、../utils.js
//    以及通过动态 import 引用的：../plugins/installed-plugin-index-records.js、
//    ../plugins/status.js、../plugins/uninstall.js、./plugins-install-record-commit.js、
//    ./plugins-registry-refresh.js、./plugins-uninstall-selection.js、./prompt.js
//  - 这里提供降级 stub：函数签名保留，但运行时直接返回错误。

/** Options accepted by `openclaw plugins uninstall` (本模块定义，含 invalidateRuntimeCache)。 */
export type PluginUninstallOptions = {
  keepFiles?: boolean;
  /** @deprecated Use keepFiles. */
  keepConfig?: boolean;
  force?: boolean;
  dryRun?: boolean;
  invalidateRuntimeCache?: boolean;
};

/**
 * 执行插件卸载命令。
 *
 * 降级实现：openclaw 的卸载运行时模块（uninstall.js、status.js、
 * installed-plugin-index-records.js 等）尚未移植。这里在命令层面降级为
 * 输出 "Plugin uninstall not supported in stub mode."，
 * 保留函数签名以便未来替换为正式实现。
 */
export async function runPluginUninstallCommand(
  id: string,
  opts: PluginUninstallOptions = {},
  runtime: {
    log: (message: string) => void;
    error: (message: string) => void;
    exit: (code: number) => void;
  } = {
    log: (message) => {
      // eslint-disable-next-line no-console -- CLI 运行时降级实现。
      console.log(message);
    },
    error: (message) => {
      // eslint-disable-next-line no-console -- CLI 运行时降级实现。
      console.error(message);
    },
    exit: (code) => {
      process.exit(code);
    },
  },
): Promise<void> {
  void opts;
  runtime.error(`Plugin uninstall not supported in stub mode (id: ${id}).`);
  return runtime.exit(1);
}
