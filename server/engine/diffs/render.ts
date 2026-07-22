/**
 * Diffs 渲染逻辑
 *
 * 移植自 openclaw/extensions/diffs/src/render.ts，简化为不依赖 pierre/diffs
 * 和 SSR 的纯函数实现：
 *   - parsePatchFiles: 解析 unified diff / patch 文本
 *   - computeBeforeAfterDiff: 行级 LCS diff，对 before/after 生成 DiffLine[]
 *   - renderDiffDocument: 渲染为独立 HTML 文档，支持 unified/split 布局、暗/亮主题
 */
import {
  DEFAULT_DIFFS_TOOL_DEFAULTS,
  type DiffFile,
  type DiffInput,
  type DiffLayout,
  type DiffLine,
  type DiffRenderOptions,
  type DiffTheme,
  type RenderedDiffDocument,
} from "./types.js";

// ==================== 工具函数 ====================

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCssString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function escapeJsonScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function detectLangFromPath(filePath: string): string | undefined {
  const ext = filePath.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (!ext) return undefined;
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    rb: "ruby",
    php: "php",
    c: "c",
    h: "c",
    cpp: "cpp",
    cc: "cpp",
    hpp: "cpp",
    cs: "csharp",
    swift: "swift",
    md: "markdown",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    html: "html",
    css: "css",
    scss: "scss",
    sh: "bash",
    bash: "bash",
    sql: "sql",
  };
  return map[ext];
}

// ==================== Patch 解析 ====================

interface ParsedPatchFile {
  oldPath?: string;
  newPath?: string;
  name: string;
  lang?: string;
  lines: DiffLine[];
}

/**
 * 解析 unified diff 文本，返回每个文件的 diff 块。
 *
 * 支持 `diff --git`、`--- a/`、`+++ b/`、`@@ ... @@` hunk 头，
 * 以及以 `+`/`-`/` ` 开头的行。
 */
export function parsePatchFiles(patch: string): ParsedPatchFile[] {
  const files: ParsedPatchFile[] = [];
  const rawLines = patch.split(/\r?\n/);

  let current: ParsedPatchFile | null = null;
  let oldNumber = 0;
  let newNumber = 0;

  const pushCurrent = () => {
    if (current && current.lines.length > 0) {
      files.push(current);
    }
    current = null;
  };

  for (const line of rawLines) {
    // 新文件块开始：diff --git a/x b/y
    const gitHeader = /^diff --git a\/(.*) b\/(.*)$/.exec(line);
    if (gitHeader) {
      pushCurrent();
      const newPath = gitHeader[2];
      current = {
        newPath,
        name: newPath,
        lang: detectLangFromPath(newPath),
        lines: [],
      };
      continue;
    }

    // --- a/path 旧文件头
    const oldHeader = /^---\s+(?:a\/)?(.+?)\s*$/.exec(line);
    if (oldHeader) {
      if (!current) {
        current = { name: oldHeader[1], lang: detectLangFromPath(oldHeader[1]), lines: [] };
      }
      if (current) {
        current.oldPath = oldHeader[1];
        if (!current.name || current.name === "diff.txt") {
          current.name = oldHeader[1];
          current.lang = detectLangFromPath(oldHeader[1]);
        }
      }
      continue;
    }
    // +++ b/path 新文件头
    const plusHeader = /^\+\+\+\s+(?:b\/)?(.+?)\s*$/.exec(line);
    if (plusHeader) {
      if (!current) {
        current = { name: plusHeader[1], lang: detectLangFromPath(plusHeader[1]), lines: [] };
      }
      if (current) {
        current.newPath = plusHeader[1];
        current.name = plusHeader[1];
        current.lang = detectLangFromPath(plusHeader[1]);
      }
      continue;
    }

    if (!current) {
      // 跳过头部噪声
      continue;
    }

    // hunk 头：@@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/.exec(line);
    if (hunkMatch) {
      oldNumber = Number(hunkMatch[1]);
      newNumber = Number(hunkMatch[2]);
      current.lines.push({
        type: "hunk",
        text: line,
      });
      continue;
    }

    // 增加行
    if (line.startsWith("+")) {
      current.lines.push({
        type: "added",
        newNumber: newNumber++,
        text: line.slice(1),
      });
      continue;
    }
    // 删除行
    if (line.startsWith("-")) {
      current.lines.push({
        type: "removed",
        oldNumber: oldNumber++,
        text: line.slice(1),
      });
      continue;
    }
    // 上下文行（包括空行：行首为空格或行本身为空）
    if (line.startsWith(" ") || line === "") {
      current.lines.push({
        type: "context",
        oldNumber: oldNumber++,
        newNumber: newNumber++,
        text: line.slice(1),
      });
      continue;
    }
    // 其他不识别的行（例如 "\ No newline at end of file"）作为上下文保留
    current.lines.push({
      type: "context",
      text: line,
    });
  }
  pushCurrent();

  return files;
}

// ==================== Before/After 行级 LCS Diff ====================

function splitLines(text: string): string[] {
  if (text === "") return [];
  // 保留末尾空行：先按通用分隔，再处理以换行结尾的情况
  const lines = text.split(/\r?\n/);
  return lines;
}

/** LCS 行级 diff，返回带 oldNumber/newNumber 的 diff 行列表。 */
export function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = splitLines(before);
  const b = splitLines(after);
  const n = a.length;
  const m = b.length;

  // dp[i][j] = a[0..i) 与 b[0..j) 的 LCS 长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯生成 diff
  const reversed: DiffLine[] = [];
  let i = n;
  let j = m;
  let oldNum = n;
  let newNum = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      reversed.push({
        type: "context",
        oldNumber: oldNum,
        newNumber: newNum,
        text: a[i - 1],
      });
      i--;
      j--;
      oldNum--;
      newNum--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversed.push({
        type: "added",
        newNumber: newNum,
        text: b[j - 1],
      });
      j--;
      newNum--;
    } else {
      reversed.push({
        type: "removed",
        oldNumber: oldNum,
        text: a[i - 1],
      });
      i--;
      oldNum--;
    }
  }
  return reversed.reverse();
}

/** 将 before/after 文本转换为单个 DiffFile。 */
export function buildBeforeAfterFile(input: {
  before: string;
  after: string;
  path?: string;
  lang?: string;
}): DiffFile {
  const name = input.path?.trim() || "diff.txt";
  return {
    oldPath: input.path,
    newPath: input.path,
    name,
    lang: input.lang || detectLangFromPath(name),
    lines: computeLineDiff(input.before, input.after),
  };
}

// ==================== 渲染 HTML ====================

function renderUnifiedLines(lines: DiffLine[], options: DiffRenderOptions): string {
  const showNumbers = options.presentation.showLineNumbers;
  const wrap = options.presentation.wordWrap;
  return lines
    .map((line) => {
      const cls =
        line.type === "added"
          ? "diff-line-added"
          : line.type === "removed"
            ? "diff-line-removed"
            : line.type === "hunk"
              ? "diff-line-hunk"
              : "diff-line-context";
      const oldNum = line.oldNumber ?? "";
      const newNum = line.newNumber ?? "";
      const indicator =
        line.type === "added" ? "+" : line.type === "removed" ? "-" : line.type === "hunk" ? "@" : " ";
      const text = escapeHtml(line.text);
      return `<tr class="${cls}">
        ${
          showNumbers
            ? `<td class="diff-num">${oldNum}</td><td class="diff-num">${newNum}</td>`
            : ""
        }
        <td class="diff-indicator">${indicator}</td>
        <td class="diff-text${wrap ? " wrap" : ""}">${text || "&nbsp;"}</td>
      </tr>`;
    })
    .join("\n");
}

function renderSplitRows(lines: DiffLine[], options: DiffRenderOptions): string {
  // 将连续 added/removed 配对成并排行，未配对留空
  const showNumbers = options.presentation.showLineNumbers;
  const wrap = options.presentation.wordWrap;
  const rows: string[] = [];

  let idx = 0;
  while (idx < lines.length) {
    const line = lines[idx];
    if (line.type === "context" || line.type === "hunk") {
      const cls = line.type === "hunk" ? "diff-line-hunk" : "diff-line-context";
      const oldNum = line.oldNumber ?? "";
      const newNum = line.newNumber ?? "";
      const text = escapeHtml(line.text);
      rows.push(`<tr class="${cls}">
        ${showNumbers ? `<td class="diff-num">${oldNum}</td>` : ""}
        <td class="diff-text${wrap ? " wrap" : ""}">${text || "&nbsp;"}</td>
        ${showNumbers ? `<td class="diff-num">${newNum}</td>` : ""}
        <td class="diff-text${wrap ? " wrap" : ""}">${text || "&nbsp;"}</td>
      </tr>`);
      idx++;
      continue;
    }

    // 收集连续 removed 与 added
    const removed: DiffLine[] = [];
    while (idx < lines.length && lines[idx].type === "removed") {
      removed.push(lines[idx]);
      idx++;
    }
    const added: DiffLine[] = [];
    while (idx < lines.length && lines[idx].type === "added") {
      added.push(lines[idx]);
      idx++;
    }
    const pairCount = Math.max(removed.length, added.length);
    for (let k = 0; k < pairCount; k++) {
      const r = removed[k];
      const a = added[k];
      const oldNum = r?.oldNumber ?? "";
      const newNum = a?.newNumber ?? "";
      const oldText = r ? escapeHtml(r.text) : "";
      const newText = a ? escapeHtml(a.text) : "";
      rows.push(`<tr>
        ${showNumbers ? `<td class="diff-num">${oldNum}</td>` : ""}
        <td class="diff-text${wrap ? " wrap" : ""} ${r ? "diff-line-removed" : "diff-line-empty"}">${oldText || "&nbsp;"}</td>
        ${showNumbers ? `<td class="diff-num">${newNum}</td>` : ""}
        <td class="diff-text${wrap ? " wrap" : ""} ${a ? "diff-line-added" : "diff-line-empty"}">${newText || "&nbsp;"}</td>
      </tr>`);
    }
  }
  return rows.join("\n");
}

function renderFileBlock(file: DiffFile, options: DiffRenderOptions): string {
  const layout: DiffLayout = options.presentation.layout;
  const fileName = escapeHtml(file.name);
  const langLabel = file.lang ? `<span class="diff-lang">${escapeHtml(file.lang)}</span>` : "";

  let tableHtml: string;
  if (layout === "split") {
    const showNumbers = options.presentation.showLineNumbers;
    const header = showNumbers
      ? `<thead><tr><th class="diff-num">#</th><th>Old</th><th class="diff-num">#</th><th>New</th></tr></thead>`
      : `<thead><tr><th>Old</th><th>New</th></tr></thead>`;
    tableHtml = `<table class="diff-table diff-split">${header}<tbody>${renderSplitRows(
      file.lines,
      options,
    )}</tbody></table>`;
  } else {
    const showNumbers = options.presentation.showLineNumbers;
    const header = showNumbers
      ? `<thead><tr><th class="diff-num">Old</th><th class="diff-num">New</th><th></th><th>Content</th></tr></thead>`
      : `<thead><tr><th></th><th>Content</th></tr></thead>`;
    tableHtml = `<table class="diff-table diff-unified">${header}<tbody>${renderUnifiedLines(
      file.lines,
      options,
    )}</tbody></table>`;
  }

  return `<section class="diff-file">
    <header class="diff-file-header">
      <span class="diff-file-name">${fileName}</span>
      ${langLabel}
    </header>
    ${tableHtml}
  </section>`;
}

function buildBaseStyles(options: DiffRenderOptions): string {
  const fontFamily = escapeCssString(options.presentation.fontFamily);
  const fontSize = options.presentation.fontSize;
  const lineHeight = Math.max(20, Math.round(fontSize * options.presentation.lineSpacing));
  const theme = options.presentation.theme;
  const isDark = theme === "dark";

  const colors = isDark
    ? {
        bg: "#05070b",
        fg: "#f8fafc",
        cardBg: "rgba(15, 23, 42, 0.14)",
        border: "rgba(148, 163, 184, 0.16)",
        cardShadow: "0 18px 48px rgba(2, 6, 23, 0.22)",
        addedBg: "rgba(34, 197, 94, 0.12)",
        addedFg: "#bbf7d0",
        removedBg: "rgba(239, 68, 68, 0.12)",
        removedFg: "#fecaca",
        hunkBg: "rgba(59, 130, 246, 0.10)",
        hunkFg: "#93c5fd",
        numFg: "rgba(148, 163, 184, 0.7)",
      }
    : {
        bg: "#f3f5f8",
        fg: "#0f172a",
        cardBg: "rgba(255, 255, 255, 0.92)",
        border: "rgba(148, 163, 184, 0.22)",
        cardShadow: "0 14px 32px rgba(15, 23, 42, 0.08)",
        addedBg: "rgba(34, 197, 94, 0.14)",
        addedFg: "#166534",
        removedBg: "rgba(239, 68, 68, 0.14)",
        removedFg: "#991b1b",
        hunkBg: "rgba(59, 130, 246, 0.12)",
        hunkFg: "#1d4ed8",
        numFg: "rgba(100, 116, 139, 0.85)",
      };

  return `
  * { box-sizing: border-box; }
  html, body { min-height: 100%; }
  html { background: ${colors.bg}; }
  body {
    margin: 0;
    min-height: 100vh;
    padding: 22px;
    font-family: "${fontFamily}", "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    background: ${colors.bg};
    color: ${colors.fg};
  }
  .diff-frame {
    max-width: 1560px;
    margin: 0 auto;
    display: grid;
    gap: 18px;
  }
  .diff-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 6px 0;
  }
  .diff-summary {
    font-size: 13px;
    opacity: 0.75;
    margin: 0 0 12px 0;
  }
  .diff-file {
    overflow: hidden;
    border-radius: 14px;
    border: 1px solid ${colors.border};
    background: ${colors.cardBg};
    box-shadow: ${colors.cardShadow};
  }
  .diff-file-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid ${colors.border};
    background: ${isDark ? "rgba(15, 23, 42, 0.4)" : "rgba(248, 250, 252, 0.8)"};
  }
  .diff-file-name {
    font-weight: 600;
    font-size: 14px;
  }
  .diff-lang {
    font-size: 11px;
    opacity: 0.7;
    padding: 2px 6px;
    border-radius: 4px;
    background: ${isDark ? "rgba(148, 163, 184, 0.12)" : "rgba(100, 116, 139, 0.1)"};
  }
  .diff-table {
    width: 100%;
    border-collapse: collapse;
    font-family: "${fontFamily}", "SF Mono", Monaco, Consolas, monospace;
    font-size: ${fontSize}px;
    line-height: ${lineHeight}px;
  }
  .diff-table thead th {
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 10px;
    border-bottom: 1px solid ${colors.border};
    background: ${isDark ? "rgba(2, 6, 23, 0.3)" : "rgba(241, 245, 249, 0.6)"};
    opacity: 0.8;
  }
  .diff-table td {
    padding: 0 10px;
    vertical-align: top;
    white-space: pre;
  }
  .diff-num {
    width: 48px;
    min-width: 48px;
    text-align: right;
    color: ${colors.numFg};
    user-select: none;
    border-right: 1px solid ${colors.border};
  }
  .diff-indicator {
    width: 18px;
    min-width: 18px;
    text-align: center;
    user-select: none;
    opacity: 0.8;
  }
  .diff-text {
    white-space: pre;
  }
  .diff-text.wrap {
    white-space: pre-wrap;
    word-break: break-word;
  }
  .diff-line-added { background: ${colors.addedBg}; }
  .diff-line-added .diff-text { color: ${colors.addedFg}; }
  .diff-line-removed { background: ${colors.removedBg}; }
  .diff-line-removed .diff-text { color: ${colors.removedFg}; }
  .diff-line-hunk { background: ${colors.hunkBg}; }
  .diff-line-hunk .diff-text { color: ${colors.hunkFg}; font-weight: 600; }
  .diff-line-empty { background: ${isDark ? "rgba(15, 23, 42, 0.3)" : "rgba(241, 245, 249, 0.5)"}; }
  @media (max-width: 720px) {
    body { padding: 12px; }
    .diff-frame { gap: 12px; }
    .diff-table { font-size: 12px; }
  }
  `;
}

function buildHtmlDocument(params: {
  title: string;
  bodyHtml: string;
  options: DiffRenderOptions;
}): string {
  const styles = buildBaseStyles(params.options);
  const themeAttr = params.options.presentation.theme;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark light" />
    <title>${escapeHtml(params.title)}</title>
    <style>${styles}</style>
  </head>
  <body data-theme="${themeAttr}">
    <main class="diff-frame">
      <h1 class="diff-title">${escapeHtml(params.title)}</h1>
      ${params.bodyHtml}
    </main>
  </body>
</html>`;
}

function buildDiffTitle(input: DiffInput): string {
  if (input.title?.trim()) return input.title.trim();
  if (input.kind === "before_after") return input.path?.trim() || "Text diff";
  return "Patch diff";
}

/** 渲染入口：将任意 DiffInput 渲染为独立 HTML 文档。 */
export async function renderDiffDocument(
  input: DiffInput,
  options: DiffRenderOptions,
  _target: "viewer" | "image" | "both" = "both",
): Promise<RenderedDiffDocument> {
  const title = buildDiffTitle(input);
  const files: DiffFile[] =
    input.kind === "before_after"
      ? [buildBeforeAfterFile(input)]
      : parsePatchFiles(input.patch).map((f) => ({
          oldPath: f.oldPath,
          newPath: f.newPath,
          name: f.name,
          lang: f.lang,
          lines: f.lines,
        }));

  const bodyHtml = files.map((f) => renderFileBlock(f, options)).join("\n");
  const html = buildHtmlDocument({ title, bodyHtml, options });

  return {
    html,
    title,
    fileCount: files.length,
    inputKind: input.kind,
  };
}

/** 默认渲染选项，便于直接调用 renderDiffDocument。 */
export function resolveDefaultRenderOptions(overrides?: Partial<DiffRenderOptions>): DiffRenderOptions {
  const presentation = {
    ...DEFAULT_DIFFS_TOOL_DEFAULTS,
    ...overrides?.presentation,
  };
  return {
    presentation,
    expandUnchanged: overrides?.expandUnchanged ?? false,
  };
}

/** 规范化主题选项。 */
export function normalizeTheme(theme?: string): DiffTheme {
  return theme === "light" ? "light" : "dark";
}

/** 规范化布局选项。 */
export function normalizeLayout(layout?: string): DiffLayout {
  return layout === "split" ? "split" : "unified";
}

// 用于调试/测试导出
export const __testing = {
  escapeHtml,
  escapeJsonScript,
  parsePatchFiles,
  computeLineDiff,
  buildBeforeAfterFile,
  renderUnifiedLines,
  renderSplitRows,
  buildBaseStyles,
};
