/**
 * 通用 CSV 导出工具函数
 * 生成 CSV 字符串并触发浏览器下载，支持中文（BOM + UTF-8）
 */

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
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
