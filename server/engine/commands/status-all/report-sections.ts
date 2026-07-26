// Converts status data into reusable report sections.
// Section builders keep table column definitions close to the rows they format.
// 移植自 openclaw/src/commands/status-all/report-sections.ts
//
// 降级说明：
//  - RenderTableOptions / TableColumn 原来自 ../../../packages/terminal-core/src/table.js
//    → cross-wms 未移植 terminal-core 包；改从已移植的 ./text-report.js 导入等价类型。
//  - buildStatusChannelsTableRows / statusChannelsTableColumns 来自 ./channels-table.js
//    → cross-wms 已移植。
//  - buildStatusAgentTableRows / buildStatusChannelDetailSections /
//    statusAgentsTableColumns / statusOverviewTableColumns 来自 ./report-tables.js
//    → cross-wms 已移植（本批次）。
//  - StatusReportSection 来自 ./text-report.js → cross-wms 已移植。
import { buildStatusChannelsTableRows, statusChannelsTableColumns } from "./channels-table.js";
import {
  buildStatusAgentTableRows,
  buildStatusChannelDetailSections,
  statusAgentsTableColumns,
  statusOverviewTableColumns,
} from "./report-tables.js";
import type { RenderTableOptions, StatusReportSection, TableColumn } from "./text-report.js";

type TableRenderer = (input: RenderTableOptions) => string;

/** Builds the top-level status overview table section. */
export function buildStatusOverviewSection(params: {
  width: number;
  renderTable: TableRenderer;
  rows: Array<{ Item: string; Value: string }>;
}): StatusReportSection {
  return {
    kind: "table",
    title: "Overview",
    width: params.width,
    renderTable: params.renderTable,
    columns: [...statusOverviewTableColumns],
    rows: params.rows,
  };
}

/** Builds the channel summary section with gateway issue overlays. */
export function buildStatusChannelsSection(params: {
  width: number;
  renderTable: TableRenderer;
  rows: Array<{
    id: string;
    label: string;
    enabled: boolean;
    state: "ok" | "warn" | "off" | "setup";
    detail: string;
  }>;
  channelIssues: Array<{
    channel: string;
    message: string;
  }>;
  ok: (text: string) => string;
  warn: (text: string) => string;
  muted: (text: string) => string;
  accentDim: (text: string) => string;
  formatIssueMessage?: (message: string) => string;
}): StatusReportSection {
  return {
    kind: "table",
    title: "Channels",
    width: params.width,
    renderTable: params.renderTable,
    columns: statusChannelsTableColumns.map((column) =>
      // The status-all report has more horizontal space than compact status output.
      column.key === "Detail" ? Object.assign({}, column, { minWidth: 28 }) : column,
    ),
    rows: buildStatusChannelsTableRows({
      rows: params.rows,
      channelIssues: params.channelIssues,
      ok: params.ok,
      warn: params.warn,
      muted: params.muted,
      accentDim: params.accentDim,
      formatIssueMessage: params.formatIssueMessage,
    }),
  } as StatusReportSection;
}

/** Wraps preformatted channel rows into a status report section. */
export function buildStatusChannelsTableSection(params: {
  width: number;
  renderTable: TableRenderer;
  columns: readonly TableColumn[];
  rows: Array<Record<string, string>>;
}): StatusReportSection {
  return {
    kind: "table",
    title: "Channels",
    width: params.width,
    renderTable: params.renderTable,
    columns: [...params.columns],
    rows: params.rows,
  };
}

/** Builds one account-detail section per configured channel. */
export function buildStatusChannelDetailsSections(params: {
  details: Array<{
    title: string;
    columns: string[];
    rows: Array<Record<string, string>>;
  }>;
  width: number;
  renderTable: TableRenderer;
  ok: (text: string) => string;
  warn: (text: string) => string;
}): StatusReportSection[] {
  return buildStatusChannelDetailSections({
    details: params.details,
    width: params.width,
    renderTable: params.renderTable,
    ok: params.ok,
    warn: params.warn,
  });
}

/** Builds the agent sessions/bootstrap summary table section. */
export function buildStatusAgentsSection(params: {
  width: number;
  renderTable: TableRenderer;
  agentStatus: {
    agents: Array<{
      id: string;
      name?: string | null;
      bootstrapPending?: boolean | null;
      sessionsCount: number;
      lastActiveAgeMs?: number | null;
      sessionsPath: string;
    }>;
  };
  ok: (text: string) => string;
  warn: (text: string) => string;
}): StatusReportSection {
  return {
    kind: "table",
    title: "Agents",
    width: params.width,
    renderTable: params.renderTable,
    columns: [...statusAgentsTableColumns],
    rows: buildStatusAgentTableRows({
      agentStatus: params.agentStatus,
      ok: params.ok,
      warn: params.warn,
    }),
  };
}

/** Builds the session table section used by status variants that include recent sessions. */
export function buildStatusSessionsSection(params: {
  width: number;
  renderTable: TableRenderer;
  columns: readonly TableColumn[];
  rows: Array<Record<string, string>>;
}): StatusReportSection {
  return {
    kind: "table",
    title: "Sessions",
    width: params.width,
    renderTable: params.renderTable,
    columns: [...params.columns],
    rows: params.rows,
  };
}

/** Builds the optional system-events section, skipped when no rows are present. */
export function buildStatusSystemEventsSection(params: {
  width: number;
  renderTable: TableRenderer;
  rows?: Array<Record<string, string>>;
  trailer?: string | null;
}): StatusReportSection {
  return {
    kind: "table",
    title: "System events",
    width: params.width,
    renderTable: params.renderTable,
    columns: [{ key: "Event", header: "Event", flex: true, minWidth: 24 }],
    rows: params.rows ?? [],
    trailer: params.trailer,
    skipIfEmpty: true,
  };
}

/** Builds the optional health table section. */
export function buildStatusHealthSection(params: {
  width: number;
  renderTable: TableRenderer;
  columns?: readonly TableColumn[];
  rows?: Array<Record<string, string>>;
}): StatusReportSection {
  return {
    kind: "table",
    title: "Health",
    width: params.width,
    renderTable: params.renderTable,
    columns: [...(params.columns ?? [])],
    rows: params.rows ?? [],
    skipIfEmpty: true,
  };
}

/** Builds the optional usage text section. */
export function buildStatusUsageSection(params: { usageLines?: string[] }): StatusReportSection {
  return {
    kind: "lines",
    title: "Usage",
    body: params.usageLines ?? [],
    skipIfEmpty: true,
  };
}
