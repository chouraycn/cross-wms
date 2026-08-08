// Simple terminal table renderer (simplified from terminal-core).
// 降级版本：简化的表格渲染，不依赖 terminal-core

type TableColumn = {
  key: string;
  header: string;
  minWidth?: number;
  flex?: boolean;
};

type TableOptions = {
  width: number;
  columns: TableColumn[];
  rows: Array<Record<string, string>>;
};

export function getTerminalTableWidth(): number {
  return process.stdout.columns ? Math.min(process.stdout.columns, 120) : 80;
}

export function renderTable(options: TableOptions): string {
  const { columns, rows } = options;
  if (columns.length === 0) {
    return "";
  }

  const colWidths: number[] = columns.map((col) => {
    let maxLen = col.header.length;
    for (const row of rows) {
      const cell = String(row[col.key] ?? "");
      const plainLen = stripAnsi(cell).length;
      if (plainLen > maxLen) {
        maxLen = plainLen;
      }
    }
    return Math.max(col.minWidth ?? 4, maxLen);
  });

  const headerRow = columns
    .map((col, i) => padRight(col.header, colWidths[i]))
    .join("  ");

  const dataRows = rows.map((row) =>
    columns
      .map((col, i) => {
        const cell = String(row[col.key] ?? "");
        return padRight(cell, colWidths[i] + (cell.length - stripAnsi(cell).length));
      })
      .join("  "),
  );

  return [headerRow, ...dataRows].join("\n");
}

function padRight(text: string, width: number): string {
  const plainLen = stripAnsi(text).length;
  if (plainLen >= width) {
    return text;
  }
  return text + " ".repeat(width - plainLen);
}

 
function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, "");
}

export function sanitizeTerminalText(text: string): string {
  return text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}
 
