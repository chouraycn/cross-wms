// Plugin install command implementation for bundled, npm, path, git, ClawHub, and hook packs.
// 移植自 openclaw/src/cli/plugins-install-command.ts。
//
// 降级策略：
//  - 此文件在 openclaw 中是重型运行时文件，依赖大量未移植的内部模块：
//    ../config/config.js、../config/types.openclaw.js、../config/types.plugins.js、
//    ../hooks/install.js、../infra/archive.js、../infra/clawhub.js、../infra/errors.js、
//    ../plugins/bundled-sources.js、../plugins/clawhub-install-records.js、../plugins/clawhub.js、
//    ../plugins/git-install.js、../plugins/install-paths.js、../plugins/install-security-scan.js、
//    ../plugins/install.js、../plugins/installed-plugin-index-records.js、../plugins/marketplace.js、
//    ../plugins/official-external-plugin-catalog.js、../plugins/plugin-lifecycle-trace.js、
//    ../plugins/schema-validator.js、../runtime.js、../utils.js、./command-format.js、
//    ./install-spec.js、./npm-resolution.js、./plugin-install-config-policy.js、
//    ./plugin-install-plan.js、./plugins-command-helpers.js、./plugins-install-persist.js、
//    ./plugins-location-bridges.js
//  - 这里提供降级 stub：函数签名保留，但运行时直接返回错误。
//  - 类型与函数引用采用内联占位，避免引入未移植的依赖。
//  - 已移植的依赖（plugins-command-helpers.ts、plugins-install-persist.ts、
//    plugins-install-record-commit.ts、plugins-location-bridges.ts、install-spec.ts、
//    command-format.ts、error-format.ts、plugins-json-logger.ts）正常使用。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";
import { formatCliCommand } from "./command-format.js";
import { looksLikeLocalInstallSpec } from "./install-spec.js";
import {
  parseNpmPackPrefixPath,
  parseNpmPrefixSpec,
} from "./plugins-command-helpers.js";
import {
  persistPluginInstall,
  persistHookPackInstall,
  resolveInstallConfigMutationPreflights,
  selectInstallMutationWriteOptions,
  supportsInstallConfigSingleTopLevelIncludeShape,
  type ConfigMutationPreflight,
  type ConfigSnapshotForInstallPersist,
} from "./plugins-install-persist.js";

// ===== 内联 InstallSafetyOverrides 类型占位 =====
type InstallSafetyOverrides = {
  config?: OpenClawConfig;
  dangerouslyForceUnsafeInstall?: boolean;
  trustedSourceLinkedOfficialInstall?: boolean;
};
// ===== 类型占位结束 =====

type ConfigSnapshotForInstallExecution = ConfigSnapshotForInstallPersist & {
  hookMutation: ConfigMutationPreflight;
  pluginMutation: ConfigMutationPreflight;
};

/**
 * 加载 install 命令所需的 config 快照。
 *
 * 降级实现：openclaw 的 `config/config.js` 的 `readConfigFileSnapshotForWrite`
 * 未移植。这里返回空快照，使命令在降级模式下安全退出。
 * 保留函数签名以便未来替换为正式实现。
 */
export async function loadConfigForInstall(
  _request: unknown,
): Promise<ConfigSnapshotForInstallExecution> {
  return {
    config: {} as OpenClawConfig,
    baseHash: undefined,
    writeOptions: selectInstallMutationWriteOptions({}),
    hookMutation: { mode: "allowed" },
    pluginMutation: { mode: "allowed" },
  };
}

/**
 * 执行插件/hook pack 安装命令。
 *
 * 降级实现：openclaw 的安装运行时模块（install.js、marketplace.js、git-install.js、
 * clawhub.js、hooks/install.js 等）尚未移植。这里在命令层面降级为：
 *  - 检测到本地路径时输出 "Plugin path not found"；
 *  - 否则输出 "Plugin install not supported in stub mode."；
 * 保留函数签名以便未来替换为正式实现。
 */
export async function runPluginInstallCommand(params: {
  raw: string;
  opts: InstallSafetyOverrides & {
    force?: boolean;
    link?: boolean;
    pin?: boolean;
    marketplace?: string;
  };
  invalidateRuntimeCache?: boolean;
  runtime?: {
    log: (message: string) => void;
    error: (message: string) => void;
    exit: (code: number) => void;
  };
}) {
  void persistPluginInstall;
  void persistHookPackInstall;
  void resolveInstallConfigMutationPreflights;
  void supportsInstallConfigSingleTopLevelIncludeShape;

  const runtime = params.runtime ?? {
    log: (message: string) => {
      // eslint-disable-next-line no-console -- CLI 运行时降级实现。
      console.log(message);
    },
    error: (message: string) => {
      // eslint-disable-next-line no-console -- CLI 运行时降级实现。
      console.error(message);
    },
    exit: (code: number) => {
      process.exit(code);
    },
  };
  const raw = params.raw;
  void formatCliCommand;
  void parseNpmPrefixSpec;
  void parseNpmPackPrefixPath;

  if (
    looksLikeLocalInstallSpec(raw, [
      ".ts",
      ".js",
      ".mjs",
      ".cjs",
      ".tgz",
      ".tar.gz",
      ".tar",
      ".zip",
    ])
  ) {
    runtime.error(
      `Plugin path not found: ${raw}. Check the path, or install from npm with ${formatCliCommand("openclaw plugins install npm:<package>")}.`,
    );
    return runtime.exit(1);
  }

  runtime.error("Plugin install not supported in stub mode.");
  return runtime.exit(1);
}
