// 规范化 manifest 声明的 CLI 命令别名。
//
// 移植自 openclaw/src/plugins/manifest-command-aliases.ts。
//
// 降级策略：
//  - 原文件依赖 @openclaw/normalization-core/string-coerce 的
//    normalizeOptionalLowercaseString 与 normalizeOptionalString。
//    改用 cross-wms 的 ../infra/string-coerce.js，行为一致。
//  - 原文件依赖 ../utils.js 的 isRecord。改用 cross-wms 的
//    ../infra/record-coerce.js，已提供同名导出。

import {
  normalizeOptionalLowercaseString,
  normalizeOptionalString,
} from "../infra/string-coerce.js";
import { isRecord } from "../infra/record-coerce.js";

export type PluginManifestCommandAliasKind = "runtime-slash";

/** manifest 声明的一个命令别名。 */
export type PluginManifestCommandAlias = {
  /** 用户可能误填入 plugin config 的命令式名称。 */
  name: string;
  /** 命令族，用于精准诊断。 */
  kind?: PluginManifestCommandAliasKind;
  /** 处理相关 CLI 操作的可选根 CLI 命令。 */
  cliCommand?: string;
};

export type PluginManifestCommandAliasRecord = PluginManifestCommandAlias & {
  pluginId: string;
  enabledByDefault?: boolean;
};

export type PluginManifestToolOwnerRecord = {
  toolName: string;
  pluginId: string;
  /**
   * "loaded" — 拥有的插件通过控制平面可用性筛选，并且工具本身通过
   * manifest-tool-availability 检查（configSignals/authSignals）。
   * 诊断可以说该工具可从此插件获得。
   *
   * "manifest-only" — manifest 声称拥有，但可用性检查失败
   * （插件被拒绝/禁用、缺少必要配置）或未执行（纯注册表查询，
   * 无插件元数据快照）。在这种情况下发出较弱的 "may be provided by"
   * 消息，以免诊断对运行时从未注册的插件过度断言。
   */
  availability?: "loaded" | "manifest-only";
};

export type PluginManifestCommandAliasRegistry = {
  plugins: readonly {
    id: string;
    enabledByDefault?: boolean;
    commandAliases?: readonly PluginManifestCommandAlias[];
    contracts?: { tools?: readonly string[] };
  }[];
};

/** 规范化 manifest 命令别名记录并报告重复/无效条目。 */
export function normalizeManifestCommandAliases(
  value: unknown,
): PluginManifestCommandAlias[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized: PluginManifestCommandAlias[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const name = normalizeOptionalString(entry) ?? "";
      if (name) {
        normalized.push({ name });
      }
      continue;
    }
    if (!isRecord(entry)) {
      continue;
    }
    const name = normalizeOptionalString(entry.name) ?? "";
    if (!name) {
      continue;
    }
    const kind = entry.kind === "runtime-slash" ? entry.kind : undefined;
    const cliCommand = normalizeOptionalString(entry.cliCommand) ?? "";
    normalized.push({
      name,
      ...(kind ? { kind } : {}),
      ...(cliCommand ? { cliCommand } : {}),
    });
  }
  return normalized.length > 0 ? normalized : undefined;
}

export function resolveManifestToolOwnerInRegistry(params: {
  toolName: string | undefined;
  registry: PluginManifestCommandAliasRegistry;
}): PluginManifestToolOwnerRecord | undefined {
  const normalizedToolName = normalizeOptionalLowercaseString(params.toolName);
  if (!normalizedToolName) {
    return undefined;
  }
  for (const plugin of params.registry.plugins) {
    const tools = plugin.contracts?.tools;
    if (!tools || tools.length === 0) {
      continue;
    }
    const match = tools.find(
      (entry) => normalizeOptionalLowercaseString(entry) === normalizedToolName,
    );
    if (match) {
      return { toolName: match, pluginId: plugin.id };
    }
  }
  return undefined;
}

export function resolveManifestCommandAliasOwnerInRegistry(params: {
  command: string | undefined;
  registry: PluginManifestCommandAliasRegistry;
}): PluginManifestCommandAliasRecord | undefined {
  const normalizedCommand = normalizeOptionalLowercaseString(params.command);
  if (!normalizedCommand) {
    return undefined;
  }

  const commandIsPluginId = params.registry.plugins.some(
    (plugin) => normalizeOptionalLowercaseString(plugin.id) === normalizedCommand,
  );

  for (const plugin of params.registry.plugins) {
    const alias = plugin.commandAliases?.find(
      (entry) => normalizeOptionalLowercaseString(entry.name) === normalizedCommand,
    );
    if (alias) {
      if (commandIsPluginId && normalizeOptionalLowercaseString(plugin.id) !== normalizedCommand) {
        continue;
      }
      return {
        ...alias,
        pluginId: plugin.id,
        ...(plugin.enabledByDefault === true ? { enabledByDefault: true } : {}),
      };
    }
  }
  return undefined;
}
