/**
 * HTML 转义与渲染工具
 *
 * 提供最小化的 HTML 实体转义、反转义与标签剥离，
 * 用于在终端/Markdown 渲染前处理可信文本片段。
 *
 * 参考自 openclaw/src/agents/utils/html.ts。
 */

/** 常见命名实体到字符的映射。 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/**
 * 转义 HTML 特殊字符，防止文本被当作 HTML 解析。
 * @param text 原始文本
 */
export function escapeHtml(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return char;
    }
  });
}

/**
 * 反转义 HTML 实体（支持命名实体与十进制/十六进制数字实体）。
 * 无法识别的实体保持原样。
 * @param text 包含 HTML 实体的文本
 */
export function unescapeHtml(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(/&(?:#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (entity) => {
    // 去掉首尾的 & 与 ;
    const body = entity.slice(1, -1);

    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
        return entity;
      }
      return String.fromCodePoint(code);
    }

    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
        return entity;
      }
      return String.fromCodePoint(code);
    }

    return NAMED_ENTITIES[body] ?? entity;
  });
}

/**
 * 剥离 HTML 标签，仅保留文本内容。
 * 不会反转义实体；如需解码可见字符，请配合 unescapeHtml 使用。
 * @param text 包含 HTML 标签的文本
 */
export function stripHtml(text: string): string {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(/<[^>]*>/g, '');
}
