/**
 * 守护进程状态输出格式化
 * 支持表格与 JSON 输出；以及终端样式化的 label/value 行格式化。
 * 参考 openclaw/src/daemon/output.ts 的架构对齐实现。
 */
import type { DaemonServiceStatus } from './service.js';

export type DaemonOutputFormat = 'table' | 'json';

/** 格式化单个守护进程状态。 */
export function formatDaemonStatus(
  status: DaemonServiceStatus,
  format: DaemonOutputFormat = 'table',
): string {
  if (format === 'json') {
    return JSON.stringify(status, null, 2);
  }
  const lines: string[] = [];
  lines.push(`名称:        ${status.name}`);
  lines.push(`平台:        ${status.platform}`);
  lines.push(`已安装:      ${status.installed ? '是' : '否'}`);
  lines.push(`运行中:      ${status.running ? '是' : '否'}`);
  if (status.pid !== undefined) lines.push(`PID:         ${status.pid}`);
  if (status.state) lines.push(`状态:        ${status.state}`);
  if (status.uptimeMs !== undefined) lines.push(`运行时长:    ${formatUptime(status.uptimeMs)}`);
  if (status.memoryUsage !== undefined) lines.push(`内存占用:    ${formatBytes(status.memoryUsage)}`);
  if (status.lastExitStatus !== undefined) lines.push(`上次退出码:  ${status.lastExitStatus}`);
  if (status.detail) lines.push(`详情:        ${status.detail}`);
  return lines.join('\n');
}

/** 格式化守护进程状态列表。 */
export function formatDaemonList(
  statuses: DaemonServiceStatus[],
  format: DaemonOutputFormat = 'table',
): string {
  if (format === 'json') {
    return JSON.stringify(statuses, null, 2);
  }
  if (statuses.length === 0) {
    return '（无守护进程）';
  }
  const header = ['名称', '平台', '已安装', '运行中', 'PID', '状态'];
  const rows = statuses.map((s) => [
    s.name,
    s.platform,
    s.installed ? '是' : '否',
    s.running ? '是' : '否',
    s.pid !== undefined ? String(s.pid) : '-',
    s.state ?? '-',
  ]);
  const all = [header, ...rows];
  const widths = header.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  return all.map((r) => r.map((c, i) => c.padEnd(widths[i])).join('  ')).join('\n');
}

/** 将毫秒运行时长格式化为人类可读字符串。 */
function formatUptime(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

/** 将字节数格式化为人类可读字符串。 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

// --- 终端样式化行格式化（参考 openclaw output） ---

/** Normalizes Windows separators for command output paths. */
export const toPosixPath = (value: string): string => value.replace(/\\/g, '/');

/** Formats a labeled daemon output line with terminal styling. */
export function formatLine(label: string, value: string): string {
  // cross-wms 暂不引入终端颜色库，用简洁的 label: value 格式
  return `${label}: ${value}`;
}

/** Writes multiple labeled lines to a writable stream. */
export function writeFormattedLines(
  stdout: NodeJS.WritableStream,
  lines: Array<{ label: string; value: string }>,
  opts?: { leadingBlankLine?: boolean },
): void {
  if (opts?.leadingBlankLine) {
    stdout.write('\n');
  }
  for (const line of lines) {
    stdout.write(`${formatLine(line.label, line.value)}\n`);
  }
}
