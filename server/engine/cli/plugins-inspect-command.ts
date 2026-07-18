// `openclaw plugins inspect`: renders plugin registry shape, capabilities, policy, diagnostics, and install records.
// 移植自 openclaw/src/cli/plugins-inspect-command.ts。
//
// 降级策略：
//  - 原模块依赖 `../../packages/terminal-core/src/table.js` 的
//    `getTerminalTableWidth`、`renderTable`。cross-wms 未移植；内联降级实现。
//  - 原模块依赖 `../../packages/terminal-core/src/theme.js` 的 `theme`。
//    cross-wms 未移植；这里内联一个 theme stub。
//  - 原模块依赖 `../config/config.js` 的 `getRuntimeConfig`。降级返回空 config。
//  - 原模块依赖 `../config/types.plugins.js` 的 `PluginInstallRecord`。
//    使用内联类型占位（与 plugins-install-records.ts 一致）。
//  - 原模块依赖 `../plugins/plugin-lifecycle-trace.js` 的
//    `tracePluginLifecyclePhase`、`tracePluginLifecyclePhaseAsync`。
//    cross-wms 已移植（../plugins/plugin-lifecycle-trace.js）。
//  - 原模块依赖 `../plugins/status.js` 的
//    `buildAllPluginInspectReports`、`buildPluginDiagnosticsReport`、
//    `buildPluginInspectReport`、`buildPluginSnapshotReport`、
//    `formatPluginCompatibilityNotice`。
//  - 原模块依赖 `../plugins/installed-plugin-index-records.js` 的
//    `loadInstalledPluginIndexInstallRecords`。
//    cross-wms 未移植；这里降级返回空记录。
//  - 原模块依赖 `../runtime.js` 的 `defaultRuntime`。降级使用 console。
//  - 原模块依赖 `../utils.js` 的 `shortenHomeInString`、`shortenHomePath`。
//    降级内联实现（原样返回输入）。
//  - 原模块依赖 `./error-format.js` 的 `formatMissingPluginMessage`。
//    cross-wms 已移植。
//  - 原模块依赖 `./plugins-json-logger.js` 的 `quietPluginJsonLogger`。
//    cross-wms 已移植。

import { formatMissingPluginMessage } from "./error-format.js";
import { quietPluginJsonLogger } from "./plugins-json-logger.js";
import {
  tracePluginLifecyclePhase,
  tracePluginLifecyclePhaseAsync,
} from "../plugins/plugin-lifecycle-trace.js";

/** Options accepted by `openclaw plugins inspect`. */
export type PluginInspectOptions = {
  json?: boolean;
  all?: boolean;
  runtime?: boolean;
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
};
// ===== theme stub 结束 =====

// ===== 内联 PluginInstallRecord 类型占位（与 plugins-install-records.ts 一致）=====
type PluginInstallRecord = {
  source?: string;
  spec?: string;
  sourcePath?: string;
  installPath?: string;
  version?: string;
  clawhubPackage?: string;
  clawhubChannel?: string;
  artifactKind?: string;
  artifactFormat?: string;
  npmIntegrity?: string;
  npmShasum?: string;
  npmTarballName?: string;
  clawpackSha256?: string;
  clawpackSpecVersion?: number;
  clawpackManifestSha256?: string;
  clawpackSize?: number;
  installedAt?: string;
};
// ===== 类型占位结束 =====

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

// ===== 内联 utils stub =====
function shortenHomeInString(value: string): string {
  return value;
}

function shortenHomePath(value: string): string {
  return value;
}
// ===== utils stub 结束 =====

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
  // 极简表格实现：仅输出列头与行值的文本表示。
  const cols = _options.columns;
  const headerLine = cols.map((c) => c.header).join("  ");
  const rows = _options.rows.map((row) => cols.map((c) => row[c.key] ?? "").join("  "));
  return [headerLine, ...rows].join("\n");
}
// ===== table stub 结束 =====

function formatInspectSection(title: string, lines: string[]): string[] {
  if (lines.length === 0) {
    return [];
  }
  return ["", theme.muted(`${title}:`), ...lines];
}

function formatCapabilityKinds(
  capabilities: Array<{
    kind: string;
  }>,
): string {
  if (capabilities.length === 0) {
    return "-";
  }
  return capabilities.map((entry) => entry.kind).join(", ");
}

function formatHookSummary(params: {
  usesLegacyBeforeAgentStart: boolean;
  typedHookCount: number;
  customHookCount: number;
}): string {
  const parts: string[] = [];
  if (params.usesLegacyBeforeAgentStart) {
    parts.push("before_agent_start");
  }
  const nonLegacyTypedHookCount =
    params.typedHookCount - (params.usesLegacyBeforeAgentStart ? 1 : 0);
  if (nonLegacyTypedHookCount > 0) {
    parts.push(`${nonLegacyTypedHookCount} typed`);
  }
  if (params.customHookCount > 0) {
    parts.push(`${params.customHookCount} custom`);
  }
  return parts.length > 0 ? parts.join(", ") : "-";
}

function formatInstallLines(install: PluginInstallRecord | undefined): string[] {
  if (!install) {
    return [];
  }
  const lines = [`Source: ${install.source ?? ""}`];
  if (install.spec) {
    lines.push(`Spec: ${install.spec}`);
  }
  if (install.sourcePath) {
    lines.push(`Source path: ${shortenHomePath(install.sourcePath)}`);
  }
  if (install.installPath) {
    lines.push(`Install path: ${shortenHomePath(install.installPath)}`);
  }
  if (install.version) {
    lines.push(`Recorded version: ${install.version}`);
  }
  if (install.clawhubPackage) {
    lines.push(`ClawHub package: ${install.clawhubPackage}`);
  }
  if (install.clawhubChannel) {
    lines.push(`ClawHub channel: ${install.clawhubChannel}`);
  }
  if (install.artifactKind) {
    lines.push(`Artifact kind: ${install.artifactKind}`);
  }
  if (install.artifactFormat) {
    lines.push(`Artifact format: ${install.artifactFormat}`);
  }
  if (install.npmIntegrity) {
    lines.push(`Npm integrity: ${install.npmIntegrity}`);
  }
  if (install.npmShasum) {
    lines.push(`Npm shasum: ${install.npmShasum}`);
  }
  if (install.npmTarballName) {
    lines.push(`Npm tarball: ${install.npmTarballName}`);
  }
  if (install.clawpackSha256) {
    lines.push(`ClawPack sha256: ${install.clawpackSha256}`);
  }
  if (install.clawpackSpecVersion !== undefined) {
    lines.push(`ClawPack spec: ${install.clawpackSpecVersion}`);
  }
  if (install.clawpackManifestSha256) {
    lines.push(`ClawPack manifest sha256: ${install.clawpackManifestSha256}`);
  }
  if (install.clawpackSize !== undefined) {
    lines.push(`ClawPack size: ${install.clawpackSize} bytes`);
  }
  if (install.installedAt) {
    lines.push(`Installed at: ${install.installedAt}`);
  }
  return lines;
}

/**
 * Inspect one plugin or all plugins using either snapshot-only or runtime-loaded registry data.
 *
 * 降级实现：openclaw 的 `plugins/status.js`、`plugins/installed-plugin-index-records.js`
 * 与 `config/config.js` 等运行时模块尚未移植。这里在命令层面降级为：
 *  - 若指定 --all 且未指定 id，输出空列表与提示；
 *  - 若指定 id 但未找到插件，输出错误信息；
 *  - 否则输出 "Plugin registry not available in stub mode."。
 * 保留函数签名以便未来替换为正式实现。
 */
export async function runPluginsInspectCommand(
  id: string | undefined,
  opts: PluginInspectOptions,
): Promise<void> {
  void quietPluginJsonLogger;
  void tracePluginLifecyclePhase;
  void tracePluginLifecyclePhaseAsync;
  void formatInstallLines;
  void formatInspectSection;
  void formatCapabilityKinds;
  void formatHookSummary;
  void getTerminalTableWidth;
  void renderTable;
  void shortenHomeInString;
  void shortenHomePath;
  void theme;
  const cfg = {} as unknown;
  void cfg;
  const installRecords: Record<string, PluginInstallRecord> = {};
  void installRecords;
  const loggerParams = opts.json ? { logger: quietPluginJsonLogger } : {};
  void loggerParams;

  if (opts.all) {
    if (id) {
      defaultRuntime.error("Pass either a plugin id or --all, not both.");
      return defaultRuntime.exit(1);
    }
    if (opts.json) {
      defaultRuntime.writeJson([]);
      return;
    }
    defaultRuntime.log(theme.muted("No plugins available in stub mode."));
    return;
  }

  if (!id) {
    defaultRuntime.error("Provide a plugin id or use --all.");
    return defaultRuntime.exit(1);
  }
  defaultRuntime.error(formatMissingPluginMessage({ id, includeSearch: true }));
  return defaultRuntime.exit(1);
}
