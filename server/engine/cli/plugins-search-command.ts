// ClawHub-backed plugin search command; queries installable plugin families and merges scores.
// 移植自 openclaw/src/cli/plugins-search-command.ts。
//
// 降级策略：
//  - 原模块依赖 @openclaw/normalization-core/string-coerce 的
//    `normalizeOptionalString`。改用 cross-wms 的 `../infra/string-coerce.js`。
//  - 原模块依赖 `../../packages/terminal-core/src/theme.js` 的 `theme`。
//    cross-wms 未移植 terminal-core 包；这里内联一个 theme stub。
//  - 原模块依赖 `../infra/clawhub.js` 的 `searchClawHubPackages`、
//    `ClawHubPackageFamily`、`ClawHubPackageSearchResult`。
//    cross-wms 未移植；这里内联类型占位与降级实现（始终返回空结果），
//    保留函数签名以便未来替换为正式实现。
//  - 原模块依赖 `../infra/errors.js` 的 `formatErrorMessage`。
//    改用 cross-wms 已有的 `./cli-utils.js` 的同名导出。
//  - 原模块依赖 `../runtime.js` 的 `defaultRuntime`/`RuntimeEnv`/`writeRuntimeJson`。
//    使用内联的 RuntimeEnv stub（与 plugins-command-helpers.ts 一致）。

import { normalizeOptionalString } from "../infra/string-coerce.js";
import { formatErrorMessage } from "./cli-utils.js";
import type { RuntimeEnv } from "./plugins-command-helpers.js";

/** Options accepted by `openclaw plugins search`. */
export type PluginsSearchOptions = {
  json?: boolean;
  limit?: number;
};

// ===== 内联 theme stub（替代未移植的 terminal-core/theme.js）=====
const theme = {
  heading(value: string): string {
    return value;
  },
  muted(value: string): string {
    return value;
  },
};
// ===== theme stub 结束 =====

// ===== 内联 ClawHubPackageFamily 与 ClawHubPackageSearchResult 类型占位 =====
export type ClawHubPackageFamily = "code-plugin" | "bundle-plugin";

export type ClawHubPackageSearchResult = {
  package: {
    name: string;
    family: ClawHubPackageFamily;
    channel: string;
    isOfficial?: boolean;
    latestVersion?: string;
    summary?: string;
  };
  score: number;
};
// ===== 类型占位结束 =====

const INSTALLABLE_PLUGIN_FAMILIES: ClawHubPackageFamily[] = ["code-plugin", "bundle-plugin"];

function clampSearchLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return 20;
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function mergePackageSearchResults(
  groups: readonly ClawHubPackageSearchResult[][],
  limit: number,
): ClawHubPackageSearchResult[] {
  const byName = new Map<string, ClawHubPackageSearchResult>();
  for (const entry of groups.flat()) {
    const existing = byName.get(entry.package.name);
    if (!existing || entry.score > existing.score) {
      byName.set(entry.package.name, entry);
    }
  }
  const selected: ClawHubPackageSearchResult[] = [];
  for (const entry of byName.values()) {
    let insertAt = selected.length;
    for (let index = 0; index < selected.length; index += 1) {
      if (entry.score > selected[index].score) {
        insertAt = index;
        break;
      }
    }
    if (insertAt < limit) {
      selected.splice(insertAt, 0, entry);
      if (selected.length > limit) {
        selected.pop();
      }
    } else if (selected.length < limit) {
      selected.push(entry);
    }
  }
  return selected;
}

function formatPackageSearchLine(entry: ClawHubPackageSearchResult): string {
  const pkg = entry.package;
  const flags = [
    pkg.family,
    pkg.channel,
    pkg.isOfficial && pkg.channel !== "official" ? "official" : undefined,
    pkg.latestVersion ? `v${pkg.latestVersion}` : undefined,
  ].filter(Boolean);
  const summary = pkg.summary ? theme.muted(` — ${pkg.summary}`) : "";
  return `${pkg.name}  ${theme.muted(flags.join(" | "))}${summary}\n  ${theme.muted(`Install: openclaw plugins install clawhub:${pkg.name}`)}`;
}

/**
 * 在 ClawHub 上搜索可安装的插件，输出 JSON 或终端文本。
 *
 * 降级实现：openclaw 的 `infra/clawhub.js` 的 `searchClawHubPackages` 未移植。
 * 降级行为是始终返回空结果集，使命令在未移植状态下安全地输出 "No ClawHub plugins found."。
 * 保留函数签名以便未来替换为正式实现。
 */
export async function runPluginsSearchCommand(
  queryParts: string[] | string,
  opts: PluginsSearchOptions = {},
  runtime: RuntimeEnv = {
    log: (message) => {
      // eslint-disable-next-line no-console -- CLI 运行时降级实现，需要向用户输出消息。
      console.log(message);
    },
    error: (message) => {
      // eslint-disable-next-line no-console -- CLI 运行时降级实现，需要向用户输出错误。
      console.error(message);
    },
  },
): Promise<void> {
  const query = normalizeOptionalString(
    Array.isArray(queryParts) ? queryParts.join(" ") : queryParts,
  );
  if (!query) {
    runtime.error("Usage: openclaw plugins search <query>");
    return;
  }

  const limit = clampSearchLimit(opts.limit);
  try {
    const groups: ClawHubPackageSearchResult[][] = await Promise.all(
      INSTALLABLE_PLUGIN_FAMILIES.map(async () => []),
    );
    const results = mergePackageSearchResults(groups, limit);

    if (opts.json) {
      // eslint-disable-next-line no-console -- CLI 运行时降级实现，输出 JSON。
      console.log(JSON.stringify({ results }, null, 2));
      return;
    }
    if (results.length === 0) {
      runtime.log("No ClawHub plugins found.");
      return;
    }
    runtime.log(`${theme.heading("ClawHub plugins")} ${theme.muted(`(${results.length})`)}`);
    runtime.log(results.map(formatPackageSearchLine).join("\n"));
  } catch (error) {
    runtime.error(formatErrorMessage(error));
  }
}
