// Shared command preflight: config readiness plus optional plugin registry activation.
// 移植自 openclaw/src/cli/command-bootstrap.ts。
//
// 降级策略：
//  - 原模块依赖 ../config/types.js 的 ConfigFileSnapshot、../runtime.js 的 RuntimeEnv、
//    ../shared/lazy-promise.js 的 createLazyImportLoader、./program/config-guard.js、
//    ./plugin-registry-loader.js。cross-wms 均未移植这些运行时模块。
//  - 此处降级为 no-op：保留函数签名，但 bootstrap 步骤全部跳过。

import type { RuntimeEnv } from "./plugins-command-helpers.js";
import type { CliPluginRegistryPolicy } from "./command-catalog.js";
import { resolveCliCommandPathPolicy } from "./command-path-policy.js";

// ===== 内联占位类型 =====
type ConfigFileSnapshot = unknown;
// ===== 占位类型结束 =====

// ===== 内联 ensureConfigGuardReady 与 ensureCliPluginRegistryLoaded stub =====
async function ensureConfigReady(_params: {
  runtime: RuntimeEnv;
  commandPath: string[];
  allowInvalid?: boolean;
  beforeStateMigrations?: (snapshot?: ConfigFileSnapshot) => Promise<boolean>;
  suppressDoctorStdout?: boolean;
}): Promise<void> {
  // 降级 no-op：openclaw 的 program/config-guard.js 未移植。
}

async function ensureCliPluginRegistryLoaded(_params: {
  scope: CliPluginRegistryPolicy["scope"];
  routeLogsToStderr?: boolean;
}): Promise<void> {
  // 降级 no-op：openclaw 的 plugin-registry-loader.js 未移植。
}
// ===== stub 结束 =====

/** Run the lazy command bootstrap steps selected by command policy. */
export async function ensureCliCommandBootstrap(params: {
  runtime: RuntimeEnv;
  commandPath: string[];
  suppressDoctorStdout?: boolean;
  skipConfigGuard?: boolean;
  allowInvalid?: boolean;
  beforeStateMigrations?: (snapshot?: ConfigFileSnapshot) => Promise<boolean>;
  loadPlugins?: boolean;
  pluginRegistry?: CliPluginRegistryPolicy;
}): Promise<void> {
  if (!params.skipConfigGuard) {
    await ensureConfigReady({
      runtime: params.runtime,
      commandPath: params.commandPath,
      ...(params.allowInvalid ? { allowInvalid: true } : {}),
      ...(params.beforeStateMigrations
        ? { beforeStateMigrations: params.beforeStateMigrations }
        : {}),
      ...(params.suppressDoctorStdout ? { suppressDoctorStdout: true } : {}),
    });
  }
  if (!params.loadPlugins) {
    return;
  }
  const pluginRegistryLoadPolicy =
    params.pluginRegistry ?? resolveCliCommandPathPolicy(params.commandPath).pluginRegistry;
  await ensureCliPluginRegistryLoaded({
    scope: pluginRegistryLoadPolicy.scope,
    routeLogsToStderr: params.suppressDoctorStdout,
  });
}
