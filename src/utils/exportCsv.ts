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
