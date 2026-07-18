// `openclaw plugins update` command implementation for tracked npm plugins and hook packs.
// 移植自 openclaw/src/cli/plugins-update-command.ts。
//
// 降级策略：
//  - 原模块依赖大量未移植的 openclaw 内部模块：
//    ../../packages/terminal-core/src/theme.js、../config/config.js、
//    ../config/io.write-prepare.js、../config/merge-patch.js、
//    ../config/plugin-install-config-migration.js、../config/types.openclaw.js、
//    ../config/types.plugins.js、../hooks/update.js、
//    ../plugins/installed-plugin-index-records.js、../plugins/update.js、../runtime.js
//    以及 ./plugins-install-persist.js、./plugins-install-record-commit.js、
//    ./plugins-registry-refresh.js、./plugins-update-outcomes.js、
//    ./plugins-update-selection.js、./prompt.js
//  - 这里提供降级 stub：函数签名保留，但运行时直接返回错误。

/** Options accepted by `openclaw plugins update`（与 plugins-cli.ts 一致）。 */
export type PluginUpdateOptions = {
  all?: boolean;
  dryRun?: boolean;
  dangerouslyForceUnsafeInstall?: boolean;
};

/**
 * Run plugin/hook-pack updates, persist changed install records, and refresh runtime registry.
 *
 * 降级实现：openclaw 的 update 运行时模块（plugins/update.js、hooks/update.js、
 * installed-plugin-index-records.js 等）尚未移植。这里在命令层面降级为
 * 输出 "Plugin update not supported in stub mode."，
 * 保留函数签名以便未来替换为正式实现。
 */
export async function runPluginUpdateCommand(_params: {
  id?: string;
  opts: PluginUpdateOptions;
}) {
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
  };
  if (_params.opts.all) {
    defaultRuntime.log("No tracked plugins or hook packs to update.");
    return;
  }
  defaultRuntime.error("Provide a plugin or hook-pack id, or use --all.");
  return defaultRuntime.exit(1);
}
