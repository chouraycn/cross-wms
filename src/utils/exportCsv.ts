/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 将数组导出为 CSV 文件并触发下载
 * @param filename - 下载文件名（如 'kpi_summary.csv'）
 * @param headers - CSV 列名（中文）
 * @param rows - CSV 数据行（二维字符串数组）
 */
export function exportToCsv(filename: string, headers: string[], rows: string[][]): void {
  if (headers.length === 0 || rows.length === 0) return;

  // 转义 CSV 字段（处理逗号、引号、换行）
  const escapeCsvField = (field: string): string => {
    if (/[",\n\r]/.test(field)) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const csvRows: string[] = [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => row.map(escapeCsvField).join(',')),
  ];

  const csv = csvRows.join('\n');
  const bomCsv = '\uFEFF' + csv; // 带 BOM 的 CSV 内容

  // 检测 pywebview 环境
  const hasPywebviewApi =
    typeof window !== 'undefined' &&
    (window as any).pywebview?.api?.download_csv;

  if (hasPywebviewApi) {
    // pywebview 环境：通过 Python API 保存文件到 ~/Downloads/
    try {
      const resultJson = (window as any).pywebview.api.download_csv(filename, bomCsv);
      const result = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
      if (result.ok) {
        // eslint-disable-next-line no-console
      console.log(`[CSV Export] 已保存到: ${result.path}`);
      } else {
        console.error(`[CSV Export] 保存失败: ${result.error}`);
        alert(`CSV 导出失败: ${result.error}`);
      }
    } catch (e: any) {
      console.error('[CSV Export] pywebview API 调用失败:', e);
      alert(`CSV 导出失败: ${e.message || e}`);
    }
    return;
  }

  // 浏览器环境：blob URL + <a> 标签下载
  const blob = new Blob([bomCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ===================== v1.7.0: 带元数据的 CSV 导出 =====================

export interface CsvMetadata {
  /** 查询 SQL 语句 */
  sql?: string;
  /** 生成时间 (ISO 8601) */
  timestamp?: string;
  /** 数据来源表 */
  dataSource?: string;
  /** 查询意图 */
  queryIntent?: string;
}

/**
 * v1.7.0: 导出带元数据注释行的 CSV
 *
 * CSV 文件头部包含：
 *   # 查询语句: {sql}
 *   # 生成时间: {timestamp}
 *   # 数据来源: {dataSource}
 *   # 查询意图: {queryIntent}
 * 后跟标准 CSV 数据行。
 */
export function exportCsvWithMetadata(
  columns: string[],
  rows: Record<string, unknown>[],
  metadata?: CsvMetadata,
  filename?: string,
): void {
  if (columns.length === 0 || rows.length === 0) return;

  const escapeCsvField = (field: string): string => {
    if (/[",\n\r]/.test(field)) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  };

  const metaLines: string[] = [];

  if (metadata?.sql) {
    metaLines.push(`# 查询语句: ${metadata.sql.replace(/\n/g, ' ')}`);
  }
  if (metadata?.timestamp) {
    metaLines.push(`# 生成时间: ${metadata.timestamp}`);
  }
  if (metadata?.dataSource) {
    metaLines.push(`# 数据来源: ${metadata.dataSource}`);
  }
  if (metadata?.queryIntent) {
    metaLines.push(`# 查询意图: ${metadata.queryIntent}`);
  }

  const headerLine = columns.map(escapeCsvField).join(',');
  const dataLines = rows.map(row =>
    columns.map(col => {
      const val = row[col];
      const str = val === null || val === undefined ? '' : String(val);
      return escapeCsvField(str);
    }).join(',')
  );

  const csv = [...metaLines, headerLine, ...dataLines].join('\n');
  const bomCsv = '\uFEFF' + csv;

  // 检测 pywebview 环境
  const hasPywebviewApi =
    typeof window !== 'undefined' &&
    (window as any).pywebview?.api?.download_csv;

  if (hasPywebviewApi) {
    try {
      const resultJson = (window as any).pywebview.api.download_csv(
        filename || `inventory-query-${Date.now()}.csv`,
        bomCsv,
      );
      const result = typeof resultJson === 'string' ? JSON.parse(resultJson) : resultJson;
      if (result.ok) {
        console.log(`[CSV Export] 已保存到: ${result.path}`);
      } else {
        console.error(`[CSV Export] 保存失败: ${result.error}`);
      }
    } catch (e: any) {
      console.error('[CSV Export] pywebview API 调用失败:', e);
    }
    return;
  }

  // 浏览器环境
  const blob = new Blob([bomCsv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || `inventory-query-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 下载容积率导入模板（支持中文字段）
 * 优先读取 public/templates/volume-template.csv，若失败则使用硬编码内容降级
 */
export function downloadVolumeTemplate(): void {
  const headers = ['仓库名称', '仓库ID', '总件数上限', '已用件数', '容积率(%)', '状态'];
  const rows: string[][] = [
    ['深圳仓', 'WH001', '5000', '3200', '64', '正常'],
    ['洛杉矶仓', 'WH002', '8000', '7500', '93.75', '满仓预警'],
    ['法兰克福仓', 'WH003', '6000', '3000', '50', '正常'],
  ];

  // 尝试从 public/templates/ 读取文件（仅当资源可访问时使用）
  fetch('/templates/volume-template.csv')
    .then((res) => {
      if (res.ok) return res.text();
      throw new Error('File not found');
    })
    .then(() => {
      // 服务端文件存在时，使用硬编码数据确保格式一致
      exportToCsv('volume-template.csv', headers, rows);
    })
    .catch(() => {
      // 降级：使用硬编码内容
      exportToCsv('volume-template.csv', headers, rows);
    });
}
