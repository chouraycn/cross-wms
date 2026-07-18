// `openclaw plugins list`: builds registry reports and defers terminal-only formatting modules.
// 移植自 openclaw/src/cli/plugins-list-command.ts。
//
// 降级策略：
//  - 原模块依赖 `../config/config.js` 的 `getRuntimeConfig`。降级返回空 config。
//  - 原模块依赖 `../../packages/terminal-core/src/table.js` 与
//    `../../packages/terminal-core/src/theme.js`。内联降级实现。
//  - 原模块依赖 `../plugins/status-snapshot.js` 的 `buildPluginRegistrySnapshotReport`。
//    cross-wms 未移植；降级返回空报告。
//  - 原模块依赖 `../plugins/source-display.js` 的 `formatPluginSourceForTable`、
//    `resolvePluginSourceRoots`。cross-wms 未移植；内联降级实现。
//  - 原模块依赖 `./command-format.js` 的 `formatCliCommand`。cross-wms 已移植。
//  - 原模块依赖 `./plugins-list-format.js` 的 `formatPluginLine`。cross-wms 已移植。
//  - 原模块依赖 `./plugins-json-logger.js` 的 `quietPluginJsonLogger`。cross-wms 已移植。
//  - 原模块依赖 `../runtime.js` 的 `defaultRuntime`、`RuntimeEnv`、`writeRuntimeJson`。
//    使用内联 RuntimeEnv stub（与 plugins-command-helpers.ts 一致）。

import type { RuntimeEnv } from "./plugins-command-helpers.js";
import { formatCliCommand } from "./command-format.js";
import { formatPluginLine } from "./plugins-list-format.js";
import { quietPluginJsonLogger } from "./plugins-json-logger.js";

/** Options accepted by the plugin list command. */
export type PluginsListOptions = {
  json?: boolean;
  enabled?: boolean;
  verbose?: boolean;
};

// ===== 内联 theme stub（替代未移植的 terminal-core/theme.js）=====
const theme = {
  heading(value: string): string {
    return value;
  },
  muted(value: string): string {
    return value;
  },
  success(value: string): string {
    return value;
  },
  warn(value: string): string {
    return value;
  },
  error(value: string): string {
    return value;
  },
  command(value: string): string {
    return value;
  },
};
// ===== theme stub 结束 =====

// ===== 内联 defaultRuntime stub =====
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
  writeJson(value: unknown) {
    // eslint-disable-next-line no-console -- CLI 运行时降级实现。
    console.log(JSON.stringify(value, null, 2));
  },
};
// ===== defaultRuntime 结束 =====

// ===== 内联 writeRuntimeJson stub =====
function writeRuntimeJson(_runtime: RuntimeEnv, value: unknown) {
  // eslint-disable-next-line no-console -- CLI 运行时降级实现。
  console.log(JSON.stringify(value, null, 2));
}
// ===== writeRuntimeJson 结束 =====

// ===== 内联 terminal-core table stub =====
function getTerminalTableWidth(): number {
  return 80;
}

type TableRow = Record<string, string>;

function renderTable(_options: {
  width: number;
  columns: ReadonlyArray<{ key: string; header: string; minWidth?: number; flex?: boolean }>;
  rows: TableRow[];
}): string {
  const cols = _options.columns;
  const headerLine = cols.map((c) => c.header).join("  ");
  const rows = _options.rows.map((row) => cols.map((c) => row[c.key] ?? "").join("  "));
  return [headerLine, ...rows].join("\n");
}
// ===== table stub 结束 =====

// ===== 内联 source-display stub =====
function resolvePluginSourceRoots(_options: {
  workspaceDir?: string;
}): Record<"stock" | "workspace" | "global", string | undefined> {
  return { stock: undefined, workspace: undefined, global: undefined };
}

function formatPluginSourceForTable(
  _plugin: { source?: string },
  _roots: Record<"stock" | "workspace" | "global", string | undefined>,
): { value: string; rootKey?: "stock" | "workspace" | "global" } {
  return { value: _plugin.source ?? "" };
}
// ===== source-display stub 结束 =====

// ===== 内联 PluginListReportItem 类型占位 =====
type PluginListReportItem = {
  id: string;
  name?: string;
  description?: string;
  format?: string;
  enabled: boolean;
  status?: string;
  source?: string;
  version?: string;
};

type PluginListReport = {
  workspaceDir?: string;
  registrySource?: string;
  registryDiagnostics?: unknown[];
  plugins: PluginListReportItem[];
  diagnostics?: unknown[];
};
// ===== 类型占位结束 =====

/**
 * Render installed plugin discovery state as JSON, compact table, or verbose text.
 *
 * 降级实现：openclaw 的 `plugins/status-snapshot.js` 与 `config/config.js`
 * 等运行时模块尚未移植。这里降级为始终输出 "No plugins found."，
 * 保留函数签名以便未来替换为正式实现。
 */
export async function runPluginsListCommand(
  opts: PluginsListOptions,
  runtime: RuntimeEnv = {
    log: (message) => {
      // eslint-disable-next-line no-console -- CLI 运行时降级实现。
      console.log(message);
    },
    error: (message) => {
      // eslint-disable-next-line no-console -- CLI 运行时降级实现。
      console.error(message);
    },
  },
): Promise<void> {
  void quietPluginJsonLogger;
  void formatPluginLine;
  void formatCliCommand;
  void formatPluginSourceForTable;
  void resolvePluginSourceRoots;
  void getTerminalTableWidth;
  void renderTable;
  void theme;

  const report: PluginListReport = {
    plugins: [],
    diagnostics: [],
    registryDiagnostics: [],
  };
  const list = opts.enabled ? report.plugins.filter((p) => p.enabled) : report.plugins;

  if (opts.json) {
    const payload = {
      workspaceDir: report.workspaceDir,
      registry: {
        source: report.registrySource,
        diagnostics: report.registryDiagnostics,
      },
      plugins: list,
      diagnostics: report.diagnostics,
    };
    writeRuntimeJson(runtime, payload);
    return;
  }

  if (list.length === 0) {
    runtime.log(
      theme.muted(
        `No plugins found. Run ${formatCliCommand("openclaw plugins install <plugin>")} to add one, or ${formatCliCommand("openclaw plugins list --json")} to inspect raw discovery state.`,
      ),
    );
    return;
  }

  // 由于报告始终为空，下方分支不可达；保留原逻辑结构以便未来替换为正式实现。
  const tableWidth = getTerminalTableWidth();
  const sourceRoots = resolvePluginSourceRoots({
    workspaceDir: report.workspaceDir,
  });
  void sourceRoots;
  runtime.log(
    renderTable({
      width: tableWidth,
      columns: [
        { key: "Name", header: "Name", minWidth: 14, flex: true },
        { key: "ID", header: "ID", minWidth: 10, flex: true },
        { key: "Format", header: "Format", minWidth: 9 },
        { key: "Status", header: "Status", minWidth: 10 },
        { key: "Source", header: "Source", minWidth: 26, flex: true },
        { key: "Version", header: "Version", minWidth: 8 },
      ],
      rows: [],
    }).trimEnd(),
  );
}

void defaultRuntime;
