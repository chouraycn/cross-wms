// HTML 导出：精简版实现，将对话内容渲染为独立 HTML 文件。
import { logger } from '../../../logger.js';

// 对话消息条目
export type HtmlExportMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp?: number | string;
  // 可选的工具调用名称
  toolName?: string;
  // 可选的消息 id
  id?: string;
};

// 对话结构
export type HtmlExportConversation = {
  // 对话标题
  title?: string;
  // 会话 id
  sessionId?: string;
  // 创建时间
  createdAt?: number | string;
  // 消息列表
  messages: HtmlExportMessage[];
  // 可选的元数据
  metadata?: Record<string, unknown>;
};

// HTML 导出选项
export type HtmlExportOptions = {
  // 是否内联 CSS（默认 true）
  inlineStyles?: boolean;
  // 是否包含元数据区块（默认 true）
  includeMetadata?: boolean;
  // 自定义 CSS（追加到默认样式后）
  extraCss?: string;
  // 自定义标题前缀
  titlePrefix?: string;
};

// HTML 导出结果
export type HtmlExportResult = {
  // 生成的 HTML 字符串
  html: string;
  // 使用的标题
  title: string;
  // 包含的消息数量
  messageCount: number;
  // 估算的字节数
  bytes: number;
};

const DEFAULT_TITLE = 'Conversation Export';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/\n/g, '&#10;');
}

function formatTimestamp(ts: number | string | undefined): string {
  if (ts === undefined || ts === null) return '';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  if (Number.isNaN(date.getTime())) return String(ts);
  return date.toISOString();
}

function resolveTitle(
  conversation: HtmlExportConversation,
  options: HtmlExportOptions,
): string {
  const prefix = options.titlePrefix?.trim();
  const base = conversation.title?.trim() || DEFAULT_TITLE;
  return prefix ? `${prefix}: ${base}` : base;
}

function resolveDefaultCss(): string {
  return [
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 880px; margin: 24px auto; padding: 0 16px; color: #1f2328; background: #ffffff; }',
    '.conversation-header { border-bottom: 1px solid #d0d7de; padding-bottom: 12px; margin-bottom: 16px; }',
    '.conversation-header h1 { font-size: 20px; margin: 0 0 8px; }',
    '.conversation-meta { color: #57606a; font-size: 12px; }',
    '.messages { display: flex; flex-direction: column; gap: 12px; }',
    '.message { border: 1px solid #d0d7de; border-radius: 8px; padding: 12px 14px; }',
    '.message.user { background: #f6f8fa; }',
    '.message.assistant { background: #ffffff; }',
    '.message.system { background: #fff8c5; border-style: dashed; }',
    '.message.tool { background: #ddf4ff; }',
    '.message-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }',
    '.message-role { font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }',
    '.message-time { color: #57606a; font-size: 11px; }',
    '.message-content { white-space: pre-wrap; word-wrap: break-word; font-size: 14px; line-height: 1.5; }',
    '.metadata { margin-top: 24px; padding: 12px; background: #f6f8fa; border-radius: 8px; font-size: 12px; color: #57606a; }',
    '.metadata h2 { font-size: 13px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }',
    '.metadata dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; }',
    '.metadata dt { font-weight: 600; }',
    '.metadata dd { margin: 0; word-break: break-all; }',
  ].join('\n');
}

function renderHeader(
  conversation: HtmlExportConversation,
  title: string,
): string {
  const meta: string[] = [];
  if (conversation.sessionId) {
    meta.push(`<span>sessionId: ${escapeHtml(conversation.sessionId)}</span>`);
  }
  if (conversation.createdAt) {
    meta.push(`<span>created: ${escapeHtml(formatTimestamp(conversation.createdAt))}</span>`);
  }
  const metaHtml = meta.length
    ? `<div class="conversation-meta">${meta.join(' · ')}</div>`
    : '';
  return `<div class="conversation-header"><h1>${escapeHtml(title)}</h1>${metaHtml}</div>`;
}

function renderMessage(message: HtmlExportMessage): string {
  const role = message.role;
  const time = formatTimestamp(message.timestamp);
  const toolBadge = message.toolName
    ? ` <span class="message-time">[${escapeHtml(message.toolName)}]</span>`
    : '';
  const idAttr = message.id ? ` data-id="${escapeAttribute(message.id)}"` : '';
  return [
    `<div class="message ${escapeAttribute(role)}"${idAttr}>`,
    '  <div class="message-header">',
    `    <span class="message-role">${escapeHtml(role)}</span>${toolBadge}`,
    `    <span class="message-time">${escapeHtml(time)}</span>`,
    '  </div>',
    `  <div class="message-content">${escapeHtml(message.content)}</div>`,
    '</div>',
  ].join('\n');
}

function renderMessages(messages: HtmlExportMessage[]): string {
  if (messages.length === 0) {
    return '<div class="messages"><p>(no messages)</p></div>';
  }
  const items = messages.map(renderMessage);
  return `<div class="messages">\n${items.join('\n')}\n</div>`;
}

function renderMetadata(metadata: Record<string, unknown>): string {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return '';
  const items = entries
    .map(
      ([key, value]) =>
        `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(
          typeof value === 'string' ? value : JSON.stringify(value),
        )}</dd>`,
    )
    .join('\n');
  return [
    '<div class="metadata">',
    '  <h2>Metadata</h2>',
    `  <dl>${items}</dl>`,
    '</div>',
  ].join('\n');
}

function renderDocument(
  body: string,
  title: string,
  css: string,
  inlineStyles: boolean,
): string {
  const styleTag = inlineStyles ? `<style>\n${css}\n</style>` : '';
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <title>${escapeHtml(title)}</title>`,
    styleTag,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ]
    .filter(Boolean)
    .join('\n');
}

// 导出主入口：根据对话与选项生成 HTML 字符串。
export function exportToHtml(
  conversation: HtmlExportConversation,
  options: HtmlExportOptions = {},
): HtmlExportResult {
  const inlineStyles = options.inlineStyles !== false;
  const includeMetadata = options.includeMetadata !== false;
  const title = resolveTitle(conversation, options);

  const parts: string[] = [];
  parts.push(renderHeader(conversation, title));
  parts.push(renderMessages(conversation.messages ?? []));
  if (includeMetadata && conversation.metadata) {
    const metaHtml = renderMetadata(conversation.metadata);
    if (metaHtml) parts.push(metaHtml);
  }

  const css = [resolveDefaultCss(), options.extraCss ?? '']
    .filter(Boolean)
    .join('\n');
  const html = renderDocument(parts.join('\n'), title, css, inlineStyles);

  const bytes = Buffer.byteLength(html, 'utf8');
  logger.info(
    `[ExportHtml] Generated ${bytes} bytes for ${conversation.messages?.length ?? 0} messages`,
  );

  return {
    html,
    title,
    messageCount: conversation.messages?.length ?? 0,
    bytes,
  };
}
