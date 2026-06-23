/**
 * CDFKnow 四层对话架构 — 第2层：Markdown 统一渲染内核
 *
 * 内置安全转义、代码高亮、Skill/MCP 卡片 AST 注入、LRU 缓存。
 * 全渠道共用同一套转换逻辑。
 *
 * 注意：不依赖 marked 等外部库，使用正则替换实现基础 Markdown 渲染。
 */

// ===================== 类型定义 =====================

/** 消息渲染配置 */
export interface MessageRenderConfig {
  streamEnabled: boolean;
  showFooterElapsed: boolean;
  showFooterModel: boolean;
  showFooterToken: boolean;
  showToolTrace: boolean;
  responsePrefix: string;
  historyMax: number;
}

// ===================== LRU 缓存 =====================

interface LRUCacheEntry {
  key: string;
  value: string;
  prev: LRUCacheEntry | null;
  next: LRUCacheEntry | null;
}

class LRUCache {
  private capacity: number;
  private map: Map<string, LRUCacheEntry>;
  private head: LRUCacheEntry | null;
  private tail: LRUCacheEntry | null;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.map = new Map();
    this.head = null;
    this.tail = null;
  }

  get(key: string): string | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    this.moveToFront(entry);
    return entry.value;
  }

  set(key: string, value: string): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      this.moveToFront(existing);
      return;
    }
    const entry: LRUCacheEntry = { key, value, prev: null, next: null };
    this.map.set(key, entry);
    this.addToFront(entry);
    if (this.map.size > this.capacity) {
      this.removeTail();
    }
  }

  private addToFront(entry: LRUCacheEntry): void {
    entry.next = this.head;
    entry.prev = null;
    if (this.head) {
      this.head.prev = entry;
    }
    this.head = entry;
    if (!this.tail) {
      this.tail = entry;
    }
  }

  private moveToFront(entry: LRUCacheEntry): void {
    if (entry === this.head) return;
    if (entry.prev) {
      entry.prev.next = entry.next;
    }
    if (entry.next) {
      entry.next.prev = entry.prev;
    }
    if (entry === this.tail) {
      this.tail = entry.prev;
    }
    entry.next = this.head;
    entry.prev = null;
    if (this.head) {
      this.head.prev = entry;
    }
    this.head = entry;
  }

  private removeTail(): void {
    if (!this.tail) return;
    this.map.delete(this.tail.key);
    if (this.tail.prev) {
      this.tail.prev.next = null;
      this.tail = this.tail.prev;
    } else {
      this.head = null;
      this.tail = null;
    }
  }
}

/** Markdown 渲染 LRU 缓存（最大 200 条） */
const renderCache = new LRUCache(200);

// ===================== 导出函数 =====================

/** 获取默认渲染配置 */
export function getDefaultRenderConfig(): MessageRenderConfig {
  return {
    streamEnabled: true,
    showFooterElapsed: true,
    showFooterModel: true,
    showFooterToken: false,
    showToolTrace: true,
    responsePrefix: '',
    historyMax: 50,
  };
}

/** HTML 安全转义 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 渲染 Markdown 为 HTML（带 LRU 缓存）
 *
 * 使用正则替换实现基础 Markdown 渲染，不依赖 marked 等外部库。
 * 支持的语法：标题、粗体、斜体、行内代码、代码块、链接、列表、水平线。
 */
export function renderMarkdown(rawMd: string, config?: MessageRenderConfig): string {
  const effectiveConfig = config ?? getDefaultRenderConfig();

  // 检查缓存
  const cacheKey = rawMd;
  const cached = renderCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  let html = rawMd;

  // 1. 安全转义（先转义再处理 Markdown 语法）
  //    代码块和行内代码需要特殊处理：先提取出来，转义后再放回
  const codeBlocks: string[] = [];
  const inlineCodes: string[] = [];

  // 提取代码块 ```lang\n...\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const idx = codeBlocks.length;
    codeBlocks.push(escapeHtml(code));
    return `%%CODEBLOCK_${idx}%%`;
  });

  // 提取行内代码 `...`
  html = html.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const idx = inlineCodes.length;
    inlineCodes.push(escapeHtml(code));
    return `%%INLINECODE_${idx}%%`;
  });

  // 2. 对剩余文本进行安全转义
  html = escapeHtml(html);

  // 3. 还原行内代码
  html = html.replace(/%%INLINECODE_(\d+)%%/g, (_match, idx: string) => {
    return `<code class="msg-inline-code">${inlineCodes[parseInt(idx, 10)]}</code>`;
  });

  // 4. 还原代码块
  html = html.replace(/%%CODEBLOCK_(\d+)%%/g, (_match, idx: string) => {
    const lang = '';
    return `<pre class="msg-code-block"><code${lang ? ` class="language-${lang}"` : ''}>${codeBlocks[parseInt(idx, 10)]}</code></pre>`;
  });

  // 5. Markdown 语法转换（在已转义的文本上操作）
  // 标题 h1-h6
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // 粗体 **text** 或 __text__
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // 斜体 *text* 或 _text_
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.+?)_/g, '<em>$1</em>');

  // 删除线 ~~text~~
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // 链接 [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // 无序列表 - item
  html = html.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
  // 包裹连续 li 为 ul
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

  // 有序列表 1. item
  html = html.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // 水平线
  html = html.replace(/^---+$/gm, '<hr>');

  // 段落：将连续的非标签行包裹为 <p>
  // 简单处理：双换行分段
  html = html.replace(/\n{2,}/g, '</p><p>');
  // 单换行转 <br>
  html = html.replace(/\n/g, '<br>');

  // 6. 添加 responsePrefix
  if (effectiveConfig.responsePrefix) {
    html = effectiveConfig.responsePrefix + html;
  }

  // 写入缓存
  renderCache.set(cacheKey, html);

  return html;
}

/**
 * 解析 Skill/MCP 自定义容器块
 *
 * 从 Markdown 中识别 <!-- skill:name -->...<!-- /skill --> 和
 * <!-- mcp:name -->...<!-- /mcp --> 容器块。
 */
export function parseToolCards(
  rawMd: string,
): Array<{ type: 'skill' | 'mcp'; title: string; body: string }> {
  const results: Array<{ type: 'skill' | 'mcp'; title: string; body: string }> = [];

  // 匹配 <!-- skill:name -->...<!-- /skill --> 或 <!-- mcp:name -->...<!-- /mcp -->
  const pattern = /<!--\s*(skill|mcp):(\S+?)\s*-->\n?([\s\S]*?)<!--\s*\/\1\s*-->/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rawMd)) !== null) {
    results.push({
      type: match[1] as 'skill' | 'mcp',
      title: match[2],
      body: match[3].trim(),
    });
  }

  return results;
}
