/**
 * 消息导出为 Markdown 工具函数
 *
 * - 将消息数组导出为 Markdown 格式字符串
 * - 触发浏览器下载的辅助函数
 */

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function messagesToMarkdown(messages: any[], title?: string): string {
  const lines: string[] = [];

  if (title) {
    lines.push(`# ${title}`);
    lines.push('');
  }

  for (const msg of messages) {
    const time = formatTimestamp(msg.timestamp ?? Date.now());
    const role = msg.role === 'user' ? '用户' : 'AI 助手';
    const model = msg.model ? ` (${msg.model})` : '';

    lines.push(`## [${time}] ${role}${model}`);
    lines.push('');
    lines.push(msg.content ?? '');
    lines.push('');
  }

  return lines.join('\n');
}

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
