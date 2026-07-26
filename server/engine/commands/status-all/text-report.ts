// Generic text-report primitives for status command output.
// Callers assemble typed sections; this file owns heading insertion and table rendering order.
// 移植自 openclaw/src/commands/status-all/text-report.ts
//
// 降级说明：
//  - RenderTableOptions / TableColumn 来自 ../../../packages/terminal-core/src/table.js
//    → 未移植，使用简化类型定义

export type TableColumn = {
  key: string;
  header: string;
  minWidth?: number;
  flex?: boolean;
  width?: number;
  align?: "left" | "right" | "center";
};

export type RenderTableOptions = {
  width: number;
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
};

type HeadingFn = (text: string) => string;
type TableRenderer = (input: RenderTableOptions) => string;

export type StatusReportSection =
  | {
      kind: "lines";
      title: string;
      body: string[];
      skipIfEmpty?: boolean;
    }
  | {
      kind: "table";
      title: string;
      width: number;
      renderTable: TableRenderer;
      columns: readonly TableColumn[];
      rows: Array<Record<string, string>>;
      trailer?: string | null;
      skipIfEmpty?: boolean;
    }
  | {
      kind: "raw";
      body: string[];
      skipIfEmpty?: boolean;
    };

export function appendStatusSectionHeading(params: {
  lines: string[];
  heading: HeadingFn;
  title: string;
}) {
  if (params.lines.length > 0) {
    params.lines.push("");
  }
  params.lines.push(params.heading(params.title));
}

function appendStatusLinesSection(params: {
  lines: string[];
  heading: HeadingFn;
  title: string;
  body: string[];
}) {
  appendStatusSectionHeading(params);
  params.lines.push(...params.body);
}

function appendStatusTableSection<Row extends Record<string, string>>(params: {
  lines: string[];
  heading: HeadingFn;
  title: string;
  width: number;
  renderTable: (input: { width: number; columns: TableColumn[]; rows: Row[] }) => string;
  columns: readonly TableColumn[];
  rows: Row[];
}) {
  appendStatusSectionHeading(params);
  params.lines.push(
    params
      .renderTable({
        width: params.width,
        columns: [...params.columns],
        rows: params.rows,
      })
      .trimEnd(),
  );
}

export function appendStatusReportSections(params: {
  lines: string[];
  heading: HeadingFn;
  sections: StatusReportSection[];
}) {
  for (const section of params.sections) {
    if (section.kind === "raw") {
      if (section.skipIfEmpty && section.body.length === 0) {
        continue;
      }
      params.lines.push(...section.body);
      continue;
    }
    if (section.kind === "lines") {
      if (section.skipIfEmpty && section.body.length === 0) {
        continue;
      }
      appendStatusLinesSection({
        lines: params.lines,
        heading: params.heading,
        title: section.title,
        body: section.body,
      });
      continue;
    }
    if (section.skipIfEmpty && section.rows.length === 0) {
      continue;
    }
    appendStatusTableSection({
      lines: params.lines,
      heading: params.heading,
      title: section.title,
      width: section.width,
      renderTable: section.renderTable,
      columns: section.columns,
      rows: section.rows,
    });
    if (section.trailer) {
      params.lines.push(section.trailer);
    }
  }
}
