// Shared renderer for pending node pairing request tables.
// 移植自 openclaw/src/cli/nodes-cli/pairing-render.ts

import type { PendingRequest } from "./types.js";

/* eslint-disable no-control-regex */
function sanitizeTerminalText(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
}

function formatTimeAgo(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function renderSimpleTable(rows: Array<Record<string, string>>, columns: Array<{ key: string; header: string; minWidth?: number; flex?: boolean }>, width: number): string {
  const colWidths: Record<string, number> = {};
  for (const col of columns) {
    colWidths[col.key] = Math.max(col.minWidth ?? 0, col.header.length);
  }
  for (const row of rows) {
    for (const col of columns) {
      const val = row[col.key] ?? "";
      if (val.length > colWidths[col.key]) {
        colWidths[col.key] = val.length;
      }
    }
  }
  const totalFixed = columns.reduce((sum, col) => sum + (colWidths[col.key] + 2), 0);
  const flexCols = columns.filter(c => c.flex);
  if (flexCols.length > 0 && totalFixed < width) {
    const extra = width - totalFixed;
    const perFlex = Math.floor(extra / flexCols.length);
    for (const col of flexCols) {
      colWidths[col.key] += perFlex;
    }
  }
  const lines: string[] = [];
  const headerLine = columns.map(col => (col.header.padEnd(colWidths[col.key]))).join("  ");
  lines.push(headerLine);
  lines.push(columns.map(col => "-".repeat(colWidths[col.key])).join("  "));
  for (const row of rows) {
    const line = columns.map(col => (row[col.key] ?? "").padEnd(colWidths[col.key])).join("  ");
    lines.push(line);
  }
  return lines.join("\n");
}

/** Render pending pairing requests with sanitized labels and relative request age. */
export function renderPendingPairingRequestsTable(params: {
  pending: PendingRequest[];
  now: number;
  tableWidth: number;
  theme: {
    heading: (text: string) => string;
    warn: (text: string) => string;
    muted: (text: string) => string;
  };
}) {
  const { pending, now, tableWidth, theme } = params;
  const rows = pending.map((r) => {
    const nodeLabel = r.displayName?.trim() ? r.displayName.trim() : r.nodeId ?? "";
    return {
      Request: sanitizeTerminalText(r.requestId),
      Node: sanitizeTerminalText(nodeLabel),
      IP: sanitizeTerminalText(r.remoteIp ?? ""),
      Requested:
        typeof (r as unknown as { ts?: number }).ts === "number"
          ? formatTimeAgo(Math.max(0, now - ((r as unknown as { ts: number }).ts)))
          : theme.muted("unknown"),
    };
  });
  return {
    heading: theme.heading("Pending"),
    table: renderSimpleTable(
      rows,
      [
        { key: "Request", header: "Request", minWidth: 8 },
        { key: "Node", header: "Node", minWidth: 14, flex: true },
        { key: "IP", header: "IP", minWidth: 10 },
        { key: "Requested", header: "Requested", minWidth: 12 },
      ],
      tableWidth,
    ).trimEnd(),
  };
}
