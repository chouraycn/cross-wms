// Pre-action policy for `plugins install`: decide whether an install may bypass invalid
// config so plugin-owned doctor/recovery code can repair broken plugin state.
// 移植自 openclaw/src/cli/plugin-install-config-policy.ts。
//
// 降级策略：
//  - 原模块依赖 `@openclaw/normalization-core/string-normalization`、
//    `../infra/json-files.js`、`../infra/npm-registry-spec.js`、
//    `../plugins/bundled-sources.js`、`../plugins/manifest.js`、
//    `../plugins/official-external-plugin-catalog.js`、`../utils.js`、
//    `./plugins-command-helpers.js`。
//    其中 `string-normalization`、`json-files.js`、`npm-registry-spec.js`、
//    `bundled-sources.js`、`manifest.js`、`official-external-plugin-catalog.js`、
//    `utils.js` 在 cross-wms 中尚未移植。
//  - 这里提供降级实现：所有恢复元数据解析返回空对象（无恢复），
//    `resolvePluginInstallRequestContext` 仅返回原始 spec，
//    `resolvePluginInstallPreactionRequest` 返回 null（无预动作），
//    `resolvePluginInstallInvalidConfigPolicy` 始终返回 "deny"，
//    保留函数签名以便未来替换为正式实现。

import type { Command } from "commander";

type PluginInstallInvalidConfigPolicy = "deny" | "allow-plugin-recovery";

/** Parsed install request plus recovery metadata needed by CLI pre-action config policy. */
export type PluginInstallRequestContext = {
  rawSpec: string;
  normalizedSpec: string;
  installKind?: "plugin";
  resolvedPath?: string;
  marketplace?: string;
  bundledPluginId?: string;
  allowInvalidConfigRecovery?: boolean;
};

type PluginInstallRequestResolution =
  | { ok: true; request: PluginInstallRequestContext }
  | { ok: false; error: string };

// ===== 内联降级：parseNpmPrefixSpec / resolveFileNpmSpecToLocalPath stubs =====
/**
 * 降级 stub：openclaw 的 `./plugins-command-helpers.js` 中
 * `parseNpmPrefixSpec` 已移植但 `resolveFileNpmSpecToLocalPath` 在原模块
 * 中已移植。这里复用已移植的实现。
 */
import { resolveFileNpmSpecToLocalPath } from "./plugins-command-helpers.js";
// ===== parseNpmPrefixSpec / resolveFileNpmSpecToLocalPath 结束 =====

/**
 * Resolve install metadata from the raw spec before Commander action handlers mutate config.
 *
 * 降级实现：openclaw 的 `bundled-sources.js`、`manifest.js`、
 * `official-external-plugin-catalog.js`、`utils.js` 未移植；
 * 这里跳过恢复元数据解析，仅返回原始 spec，保留函数签名。
 */
export function resolvePluginInstallRequestContext(params: {
  rawSpec: string;
  marketplace?: string;
  installKind?: "plugin";
}): PluginInstallRequestResolution {
  if (params.marketplace) {
    return {
      ok: true,
      request: {
        rawSpec: params.rawSpec,
        normalizedSpec: params.rawSpec,
        installKind: "plugin",
        marketplace: params.marketplace,
      },
    };
  }
  const fileSpec = resolveFileNpmSpecToLocalPath(params.rawSpec);
  if (fileSpec && !fileSpec.ok) {
    return {
      ok: false,
      error: fileSpec.error,
    };
  }
  const normalizedSpec = fileSpec && fileSpec.ok ? fileSpec.path : params.rawSpec;
  return {
    ok: true,
    request: {
      rawSpec: params.rawSpec,
      normalizedSpec,
      // 降级：不解析 resolvedPath（utils.js 的 resolveUserPath 未移植）。
      ...(params.installKind === "plugin" ? { installKind: "plugin" } : {}),
    },
  };
}

/**
 * Recover the plugin install request from Commander state plus raw argv fallback parsing.
 *
 * 降级实现：openclaw 的 `./plugins-command-helpers.js` 中
 * `parseNpmPrefixSpec` 等未移植；这里返回 null（无预动作恢复），
 * 保留函数签名以便未来替换为正式实现。
 */
export function resolvePluginInstallPreactionRequest(_params: {
  actionCommand: Command;
  commandPath: string[];
  argv: string[];
}): PluginInstallRequestContext | null {
  // 降级：跳过 argv fallback 解析与 Commander state 读取。
  return null;
}

/**
 * Decide whether invalid config should block a command before plugin recovery can run.
 *
 * 降级实现：openclaw 的恢复元数据解析未移植；这里始终返回 "deny"，
 * 保留函数签名以便未来替换为正式实现。
 */
export function resolvePluginInstallInvalidConfigPolicy(
  request: PluginInstallRequestContext | null,
): PluginInstallInvalidConfigPolicy {
  if (!request) {
    return "deny";
  }
  return request.allowInvalidConfigRecovery === true ? "allow-plugin-recovery" : "deny";
}
