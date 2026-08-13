/**
 * Diffs Tool Extension
 *
 * 只读 diff 查看与文本差异计算。通过 ExtensionBridge 注册真实可调用工具，
 * Agent 启用本扩展后即可调用以下工具：
 *   - diffs_compute  计算两段文本的逐行差异（unified/split 两种布局）
 *   - diffs_render   将已计算的 diff 渲染为 HTML 视图片段
 *   - diffs_list     列出进程内已缓存的 diff 快照
 *
 * 纯内存实现，无外部依赖，适用于 Agent 对文本/代码变更的审阅与展示。
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';

const manifest: ExtensionManifest = {
  id: 'diffs',
  name: 'Diffs Tool',
  description: 'Read-only diff viewer plugin and file renderer for agents',
  version: '1.0.0',
  kind: 'tool',
  sdkVersion: '1.0.0',
  requiresAuth: false,
  authType: 'none',
};

interface DiffSnapshot {
  id: string;
  leftLabel: string;
  rightLabel: string;
  layout: string;
  created: number;
  hunks: DiffLine[];
}

interface DiffLine {
  type: 'equal' | 'add' | 'remove';
  leftNo?: number;
  rightNo?: number;
  text: string;
}

/** 进程内 diff 快照缓存（按 id） */
const snapshots = new Map<string, DiffSnapshot>();

/** 基于 LCS 的简易逐行 diff */
function computeLineDiff(left: string, right: string): DiffLine[] {
  const a = left.split('\n');
  const b = right.split('\n');
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS 长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let leftNo = 1;
  let rightNo = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: 'equal', leftNo: leftNo++, rightNo: rightNo++, text: a[i] });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: 'remove', leftNo: leftNo++, text: a[i] });
      i++;
    } else {
      lines.push({ type: 'add', rightNo: rightNo++, text: b[j] });
      j++;
    }
  }
  while (i < n) lines.push({ type: 'remove', leftNo: leftNo++, text: a[i++] });
  while (j < m) lines.push({ type: 'add', rightNo: rightNo++, text: b[j++] });
  return lines;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderUnified(hunks: DiffLine[]): string {
  return hunks
    .map((l) => {
      const mark = l.type === 'add' ? '+' : l.type === 'remove' ? '-' : ' ';
      return `<div class="diff-line diff-${l.type}"><span class="diff-mark">${mark}</span><span class="diff-text">${escapeHtml(l.text)}</span></div>`;
    })
    .join('');
}

function renderSplit(hunks: DiffLine[]): string {
  return hunks
    .map((l) => {
      const left = l.type === 'add' ? '' : escapeHtml(l.text);
      const right = l.type === 'remove' ? '' : escapeHtml(l.text);
      const cls = l.type;
      return `<div class="diff-row diff-${cls}"><span class="diff-left">${left}</span><span class="diff-right">${right}</span></div>`;
    })
    .join('');
}

export default class DiffsTool implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering Diffs tool extension');

    const defaults = (context.config['defaults'] as Record<string, unknown>) || {};
    const defaultLayout = (defaults['layout'] as string) || 'unified';
    const defaultTheme = (defaults['theme'] as string) || 'dark';
    const ttlSeconds = Number(defaults['ttlSeconds'] ?? 1800);

    context.logger.info(`Diffs tool registered with layout=${defaultLayout}, theme=${defaultTheme}`);

    // diffs_compute：计算两段文本差异
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'diffs_compute',
          description: '计算两段文本的逐行差异，返回 diff 行列表并缓存一份快照供后续渲染。',
          parameters: {
            type: 'object',
            properties: {
              left: { type: 'string', description: '左侧（原）文本' },
              right: { type: 'string', description: '右侧（新）文本' },
              leftLabel: { type: 'string', description: '左侧标签（可选）' },
              rightLabel: { type: 'string', description: '右侧标签（可选）' },
              layout: { type: 'string', description: '布局：unified(默认) 或 split', enum: ['unified', 'split'] },
            },
            required: ['left', 'right'],
          },
        },
      },
      async (args) => {
        const left = String(args.left ?? '');
        const right = String(args.right ?? '');
        const layout = String(args.layout ?? defaultLayout);
        const hunks = computeLineDiff(left, right);
        const id = `diff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const snapshot: DiffSnapshot = {
          id,
          leftLabel: String(args.leftLabel ?? 'left'),
          rightLabel: String(args.rightLabel ?? 'right'),
          layout,
          created: Date.now(),
          hunks,
        };
        // 简易 TTL 清理：插入前移除过期项
        const now = Date.now();
        for (const [k, v] of snapshots) {
          if (now - v.created > ttlSeconds * 1000) snapshots.delete(k);
        }
        snapshots.set(id, snapshot);
        const summary = {
          ok: true,
          id,
          layout,
          leftLabel: snapshot.leftLabel,
          rightLabel: snapshot.rightLabel,
          stats: {
            equal: hunks.filter((h) => h.type === 'equal').length,
            added: hunks.filter((h) => h.type === 'add').length,
            removed: hunks.filter((h) => h.type === 'remove').length,
          },
        };
        return JSON.stringify(summary);
      },
    );

    // diffs_render：将已缓存快照渲染为 HTML
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'diffs_render',
          description: '将已计算的 diff 快照渲染为 HTML 视图片段。若不传 id 则直接对传入文本实时计算并渲染。',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'diffs_compute 返回的快照 id（可选，缺省则需提供 left/right）' },
              left: { type: 'string', description: '左侧文本（无 id 时使用）' },
              right: { type: 'string', description: '右侧文本（无 id 时使用）' },
              layout: { type: 'string', description: '布局：unified 或 split', enum: ['unified', 'split'] },
            },
            required: [],
          },
        },
      },
      async (args) => {
        let hunks: DiffLine[];
        let layout: string;
        let leftLabel: string;
        let rightLabel: string;
        const id = args.id ? String(args.id) : '';
        const snap = id ? snapshots.get(id) : undefined;
        if (snap) {
          hunks = snap.hunks;
          layout = String(args.layout ?? snap.layout);
          leftLabel = snap.leftLabel;
          rightLabel = snap.rightLabel;
        } else {
          hunks = computeLineDiff(String(args.left ?? ''), String(args.right ?? ''));
          layout = String(args.layout ?? defaultLayout);
          leftLabel = 'left';
          rightLabel = 'right';
        }
        const body = layout === 'split' ? renderSplit(hunks) : renderUnified(hunks);
        const html = `<div class="diff-viewer diff-theme-${defaultTheme}" data-layout="${layout}"><div class="diff-header"><span>${escapeHtml(leftLabel)}</span><span>${escapeHtml(rightLabel)}</span></div>${body}</div>`;
        return JSON.stringify({ ok: true, id: id || null, layout, htmlLength: html.length, html });
      },
    );

    // diffs_list：列出已缓存快照
    context.bridge.registerTool(
      {
        type: 'function',
        function: {
          name: 'diffs_list',
          description: '列出当前进程内已缓存的 diff 快照',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      async () => {
        const list = Array.from(snapshots.values()).map((s) => ({
          id: s.id,
          leftLabel: s.leftLabel,
          rightLabel: s.rightLabel,
          layout: s.layout,
          created: s.created,
          lines: s.hunks.length,
        }));
        return JSON.stringify({ ok: true, count: list.length, snapshots: list });
      },
    );
  }

  unregister(): void {
    console.log('Unregistering Diffs tool extension');
  }
}
