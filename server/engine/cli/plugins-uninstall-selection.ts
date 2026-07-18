// 插件卸载 id 解析器，支持 registry id、显示名、npm spec 与 ClawHub spec。
// 移植自 openclaw/src/cli/plugins-uninstall-selection.ts。
//
// 降级策略：
//  - 原模块依赖 `../config/types.openclaw.js` 的 `OpenClawConfig`。
//    cross-wms 未移植该类型；这里使用 `../gateway/_openclaw-stubs.js` 中
//    已定义的宽松 `OpenClawConfig` 占位类型，保留索引签名以兼容字段访问。
//  - 原模块依赖 `../infra/clawhub-spec.js` 的 `parseClawHubPluginSpec`。
//    cross-wms 的 `clawhub-spec.js` 使用了不同的 API（zod schema 风格），
//    未导出 `parseClawHubPluginSpec`，这里内联实现 openclaw 原版逻辑。
//  - 原模块依赖 `../plugins/registry.js` 的 `PluginRecord`。
//    cross-wms 的 `plugins/registry.js` 使用了不同的 `RegistryEntry` 结构。
//    这里内联结构兼容的类型占位，仅包含本模块实际访问的 `id`/`name` 字段。

import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";
import { normalizeLowercaseStringOrEmpty } from "../infra/string-coerce.js";

// ============================================================================
// 内联降级：../infra/clawhub-spec.js —— parseClawHubPluginSpec
// ============================================================================

/**
 * 解析 `clawhub:<name>[@version]` 规范的结果。
 * 与 openclaw `infra/clawhub-spec.js` 的 `parseClawHubPluginSpec` 返回类型一致。
 */
type ParsedClawHubPluginSpec = {
  name: string;
  version?: string;
  baseUrl?: string;
};

/**
 * 解析显式 `clawhub:<name>[@version]` 包规范。
 *
 * 降级说明：cross-wms 的 `clawhub-spec.js` 使用了不同的 API（zod schema），
 * 未导出 `parseClawHubPluginSpec`。这里内联实现 openclaw 原版的完整逻辑。
 */
function parseClawHubPluginSpec(raw: string): ParsedClawHubPluginSpec | null {
  const trimmed = raw.trim();
  if (!normalizeLowercaseStringOrEmpty(trimmed).startsWith("clawhub:")) {
    return null;
  }
  const spec = trimmed.slice("clawhub:".length).trim();
  if (!spec) {
    return null;
  }
  const atIndex = spec.lastIndexOf("@");
  if (atIndex <= 0) {
    return { name: spec };
  }
  if (atIndex >= spec.length - 1) {
    return null;
  }
  const name = spec.slice(0, atIndex).trim();
  const version = spec.slice(atIndex + 1).trim();
  if (!name || !version) {
    return null;
  }
  return { name, version };
}

// ============================================================================
// 内联降级：../plugins/registry.js —— PluginRecord 类型占位
// ============================================================================

/**
 * 插件注册表记录（降级类型占位）。
 *
 * 降级原因：cross-wms 的 `plugins/registry.js` 使用了不同的 `RegistryEntry` 结构，
 * 没有 `PluginRecord` 类型。这里定义与 openclaw 结构兼容的类型，仅包含本模块
 * 实际访问的 `id`/`name` 字段。
 */
type PluginRecord = {
  id: string;
  name?: string;
};

// ============================================================================
// 内联降级：../config/types.plugins.js —— PluginInstallRecord 类型占位
// ============================================================================

/**
 * 插件安装记录（降级类型占位）。
 *
 * 降级原因：cross-wms 未移植 `config/types.plugins.js`。
 * 这里定义与 openclaw 结构兼容的类型，仅包含本模块实际访问的字段。
 */
type PluginInstallRecordLike = {
  spec?: string;
  resolvedSpec?: string;
  resolvedName?: string;
  marketplacePlugin?: string;
  clawhubPackage?: string;
};

// ============================================================================
// uninstall-selection 实现
// ============================================================================

/**
 * 从用户输入解析待卸载插件的 id。
 *
 * 解析顺序：registry id / 显示名 / 安装 spec / ClawHub spec。
 */
export function resolvePluginUninstallId<
  TPlugin extends Pick<PluginRecord, "id" | "name">,
>(params: {
  rawId: string;
  config: OpenClawConfig;
  plugins: TPlugin[];
}): { pluginId: string; plugin?: TPlugin } {
  const rawId = params.rawId.trim();
  const plugin = params.plugins.find((entry) => entry.id === rawId || entry.name === rawId);
  if (plugin) {
    return { pluginId: plugin.id, plugin };
  }

  const installs = (
    (params.config as { plugins?: { installs?: Record<string, PluginInstallRecordLike> } })
      .plugins?.installs ?? {}
  );
  for (const [pluginId, install] of Object.entries(installs)) {
    if (
      install.spec === rawId ||
      install.resolvedSpec === rawId ||
      install.resolvedName === rawId ||
      install.marketplacePlugin === rawId
    ) {
      return { pluginId };
    }
  }

  const requestedClawHub = parseClawHubPluginSpec(rawId);
  if (requestedClawHub) {
    for (const [pluginId, install] of Object.entries(installs)) {
      const installedClawHubName =
        install.clawhubPackage ??
        parseClawHubPluginSpec(install.spec ?? "")?.name ??
        parseClawHubPluginSpec(install.resolvedSpec ?? "")?.name;
      if (installedClawHubName === requestedClawHub.name) {
        return { pluginId };
      }
    }
  }

  return { pluginId: rawId };
}
