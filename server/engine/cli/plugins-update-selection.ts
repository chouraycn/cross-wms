// 插件与 hook-pack 更新选择器，用于从 CLI 输入解析 id 与可选 npm spec 覆盖。
// 移植自 openclaw/src/cli/plugins-update-selection.ts。
//
// 降级策略：
//  - 原模块依赖 `../config/types.hooks.js` 的 `HookInstallRecord`。
//    cross-wms 未移植该类型；这里内联结构兼容的类型占位。
//  - 原模块依赖 `../config/types.plugins.js` 的 `PluginInstallRecord`。
//    cross-wms 未移植该类型；这里内联结构兼容的类型占位。
//  - 原模块依赖 `../infra/npm-registry-spec.js` 的 `parseRegistryNpmSpec`。
//    cross-wms 已移植同名导出，直接使用。
//  - 原模块依赖 `./plugins-install-records.js` 的
//    `extractInstalledNpmPackageName`/`extractInstalledNpmHookPackageName`。
//    cross-wms 已移植（见 ./plugins-install-records.js）。

import { parseRegistryNpmSpec } from "../infra/npm-registry-spec.js";
import {
  extractInstalledNpmHookPackageName,
  extractInstalledNpmPackageName,
} from "./plugins-install-records.js";

// ============================================================================
// 内联降级：../config/types.plugins.js —— PluginInstallRecord 类型占位
// ============================================================================

/**
 * 插件安装记录（降级类型占位）。
 *
 * 降级原因：cross-wms 未移植 `config/types.plugins.js`。
 * 这里定义与 openclaw 结构兼容的类型，仅包含本模块实际访问的字段。
 */
type PluginInstallRecord = Parameters<typeof extractInstalledNpmPackageName>[0];

// ============================================================================
// 内联降级：../config/types.hooks.js —— HookInstallRecord 类型占位
// ============================================================================

/**
 * Hook-pack 安装记录（降级类型占位）。
 *
 * 降级原因：cross-wms 未移植 `config/types.hooks.js`。
 * 这里定义与 openclaw 结构兼容的类型。
 */
type HookInstallRecord = Parameters<typeof extractInstalledNpmHookPackageName>[0];

// ============================================================================
// update-selection 实现
// ============================================================================

/** Resolve a plugin update target and optional npm spec override from CLI input. */
export function resolvePluginUpdateSelection(params: {
  installs: Record<string, PluginInstallRecord>;
  rawId?: string;
  all?: boolean;
}): { pluginIds: string[]; specOverrides?: Record<string, string> } {
  if (params.all) {
    return { pluginIds: Object.keys(params.installs) };
  }
  if (!params.rawId) {
    return { pluginIds: [] };
  }

  if (params.rawId in params.installs) {
    return { pluginIds: [params.rawId] };
  }

  const parsedSpec = parseRegistryNpmSpec(params.rawId);
  if (!parsedSpec) {
    return { pluginIds: [params.rawId] };
  }
  const matches = Object.entries(params.installs).filter(([, install]) => {
    return extractInstalledNpmPackageName(install) === parsedSpec.name;
  });
  if (matches.length !== 1) {
    return { pluginIds: [params.rawId] };
  }

  const [pluginId] = matches[0];
  if (!pluginId) {
    return { pluginIds: [params.rawId] };
  }
  if (parsedSpec.selectorKind === "none") {
    return {
      pluginIds: [pluginId],
      specOverrides: {
        [pluginId]: parsedSpec.raw,
      },
    };
  }
  return {
    pluginIds: [pluginId],
    specOverrides: {
      [pluginId]: parsedSpec.raw,
    },
  };
}

/** Resolve a hook-pack update target and optional npm spec override from CLI input. */
export function resolveHookPackUpdateSelection(params: {
  installs: Record<string, HookInstallRecord>;
  rawId?: string;
  all?: boolean;
}): { hookIds: string[]; specOverrides?: Record<string, string> } {
  if (params.all) {
    return { hookIds: Object.keys(params.installs) };
  }
  if (!params.rawId) {
    return { hookIds: [] };
  }
  if (params.rawId in params.installs) {
    return { hookIds: [params.rawId] };
  }

  const parsedSpec = parseRegistryNpmSpec(params.rawId);
  if (!parsedSpec || parsedSpec.selectorKind === "none") {
    return { hookIds: [] };
  }

  const matches = Object.entries(params.installs).filter(([, install]) => {
    return extractInstalledNpmHookPackageName(install) === parsedSpec.name;
  });
  if (matches.length !== 1) {
    return { hookIds: [] };
  }

  const [hookId] = matches[0];
  if (!hookId) {
    return { hookIds: [] };
  }
  return {
    hookIds: [hookId],
    specOverrides: {
      [hookId]: parsedSpec.raw,
    },
  };
}
