// 检测并格式化插件安装路径警告。
// 降级实现：openclaw 中从 @openclaw/normalization-core/string-coerce 导入 normalizeOptionalString，
// 以及从 ../config/types.plugins.js 导入 PluginInstallRecord 类型；
// cross-wms 使用本地 string-coerce 和本地类型定义。
import fs from "node:fs/promises";
import path from "node:path";

import { normalizeOptionalString } from "./string-coerce.js";

/**
 * 插件安装记录类型。
 * 降级定义：openclaw 在 ../config/types.plugins.js 中导出，
 * cross-wms 未移植该文件，这里定义最小化的本地类型。
 */
export type PluginInstallRecord = {
  source?: "path" | "npm" | "git" | string;
  sourcePath?: string | null;
  installPath?: string | null;
};

type PluginInstallPathIssue = {
  kind: "custom-path" | "missing-path";
  pluginId: string;
  path: string;
};

function resolvePluginInstallCandidatePaths(
  install: PluginInstallRecord | null | undefined,
): string[] {
  if (!install || install.source !== "path") {
    return [];
  }

  return [install.sourcePath, install.installPath]
    .map((value) => normalizeOptionalString(value) ?? "")
    .filter(Boolean);
}

export async function detectPluginInstallPathIssue(params: {
  pluginId: string;
  install: PluginInstallRecord | null | undefined;
}): Promise<PluginInstallPathIssue | null> {
  const candidatePaths = resolvePluginInstallCandidatePaths(params.install);
  if (candidatePaths.length === 0) {
    return null;
  }

  for (const candidatePath of candidatePaths) {
    try {
      await fs.access(path.resolve(candidatePath));
      return {
        kind: "custom-path",
        pluginId: params.pluginId,
        path: candidatePath,
      };
    } catch {
      // 在警告安装过期前继续检查剩余候选路径。
    }
  }

  return {
    kind: "missing-path",
    pluginId: params.pluginId,
    path: candidatePaths[0] ?? "(unknown)",
  };
}

export function formatPluginInstallPathIssue(params: {
  issue: PluginInstallPathIssue;
  pluginLabel: string;
  defaultInstallCommand: string;
  repoInstallCommand?: string | null;
  formatCommand?: (command: string) => string;
}): string[] {
  const formatCommand = params.formatCommand ?? ((command: string) => command);
  if (params.issue.kind === "custom-path") {
    return [
      `${params.pluginLabel} is installed from a custom path: ${params.issue.path}`,
      `Main updates will not automatically replace that plugin with the repo's default ${params.pluginLabel} package.`,
      `Reinstall with "${formatCommand(params.defaultInstallCommand)}" when you want to return to the standard ${params.pluginLabel} plugin.`,
      ...(params.repoInstallCommand
        ? [
            `If you are intentionally running from a repo checkout, reinstall that checkout explicitly with "${formatCommand(params.repoInstallCommand)}" after updates.`,
          ]
        : []),
    ];
  }
  return [
    `${params.pluginLabel} is installed from a custom path that no longer exists: ${params.issue.path}`,
    `Reinstall with "${formatCommand(params.defaultInstallCommand)}".`,
    ...(params.repoInstallCommand
      ? [
          `If you are running from a repo checkout, you can also use "${formatCommand(params.repoInstallCommand)}".`,
        ]
      : []),
  ];
}
