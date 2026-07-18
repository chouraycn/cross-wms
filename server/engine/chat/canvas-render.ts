/**
 * 聊天画布渲染
 *
 * 将聊天画布 payload 渲染为文本和元数据，
 * 支持从 JSON 工具 payload 或 markdown 嵌入短代码中提取画布预览。
 */

import type { CanvasPreview, CanvasSurface, CanvasRenderType } from './types.js';

function tryParseJsonRecord(value: string | undefined): Record<string, unknown> | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function getRecordStringField(
  record: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function getRecordNumberField(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}

function getNestedRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key];
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function normalizeSurface(value: string | undefined): CanvasSurface | undefined {
  const surfaces: CanvasSurface[] = ['assistant_message', 'user_message', 'sidebar'];
  return surfaces.includes(value as CanvasSurface) ? (value as CanvasSurface) : undefined;
}

function normalizePreferredHeight(value: number | undefined): number | undefined {
  const minHeight = 160;
  const maxHeight = 1200;
  if (typeof value === 'number' && Number.isFinite(value) && value >= minHeight) {
    return Math.min(Math.trunc(value), maxHeight);
  }
  return undefined;
}

function coerceCanvasPreview(
  record: Record<string, unknown> | undefined,
): CanvasPreview | undefined {
  if (!record) {
    return undefined;
  }
  const kind = getRecordStringField(record, 'kind')?.trim().toLowerCase();
  if (kind !== 'canvas') {
    return undefined;
  }
  const presentation = getNestedRecord(record, 'presentation');
  const view = getNestedRecord(record, 'view');
  const source = getNestedRecord(record, 'source');
  const requestedSurface =
    getRecordStringField(presentation, 'target') ?? getRecordStringField(record, 'target');
  const surface = requestedSurface ? normalizeSurface(requestedSurface) : 'assistant_message';
  if (!surface) {
    return undefined;
  }
  const title = getRecordStringField(presentation, 'title') ?? getRecordStringField(view, 'title');
  const preferredHeight = normalizePreferredHeight(
    getRecordNumberField(presentation, 'preferred_height') ??
      getRecordNumberField(presentation, 'preferredHeight') ??
      getRecordNumberField(view, 'preferred_height') ??
      getRecordNumberField(view, 'preferredHeight'),
  );
  const className =
    getRecordStringField(presentation, 'class_name') ??
    getRecordStringField(presentation, 'className');
  const style = getRecordStringField(presentation, 'style');
  const viewUrl = getRecordStringField(view, 'url') ?? getRecordStringField(view, 'entryUrl');
  const viewId = getRecordStringField(view, 'id') ?? getRecordStringField(view, 'docId');
  const render = 'url' as CanvasRenderType;

  if (viewUrl) {
    return {
      kind: 'canvas',
      surface,
      render,
      url: viewUrl,
      ...(viewId ? { viewId } : {}),
      ...(title ? { title } : {}),
      ...(preferredHeight ? { preferredHeight } : {}),
      ...(className ? { className } : {}),
      ...(style ? { style } : {}),
    };
  }
  const sourceType = getRecordStringField(source, 'type')?.trim().toLowerCase();
  if (sourceType === 'url') {
    const url = getRecordStringField(source, 'url');
    if (!url) {
      return undefined;
    }
    return {
      kind: 'canvas',
      surface,
      render,
      url,
      ...(title ? { title } : {}),
      ...(preferredHeight ? { preferredHeight } : {}),
      ...(className ? { className } : {}),
      ...(style ? { style } : {}),
    };
  }
  return undefined;
}

function parseCanvasAttributes(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const key = match[1]?.trim().toLowerCase();
    const value = (match[2] ?? match[3] ?? '').trim();
    if (key && value) {
      attrs[key] = value;
    }
  }
  return attrs;
}

function defaultCanvasEntryUrl(ref: string): string {
  const encoded = encodeURIComponent(ref.trim());
  return `/__crosswms__/canvas/documents/${encoded}/index.html`;
}

function parseFenceSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const fenceRe = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text))) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

function previewFromShortcode(attrs: Record<string, string>): CanvasPreview | undefined {
  if (attrs.target && normalizeSurface(attrs.target) !== 'assistant_message') {
    return undefined;
  }
  const surface: CanvasSurface = 'assistant_message';
  const title = attrs.title?.trim() || undefined;
  const preferredHeight =
    attrs.height && Number.isFinite(Number(attrs.height))
      ? normalizePreferredHeight(Number(attrs.height))
      : undefined;
  const className = attrs.class?.trim() || attrs.class_name?.trim() || undefined;
  const style = attrs.style?.trim() || undefined;
  const ref = attrs.ref?.trim();
  const url = attrs.url?.trim();
  if (url || ref) {
    return {
      kind: 'canvas',
      surface,
      render: 'url',
      url: url ?? defaultCanvasEntryUrl(ref),
      ...(ref ? { viewId: ref } : {}),
      ...(title ? { title } : {}),
      ...(preferredHeight ? { preferredHeight } : {}),
      ...(className ? { className } : {}),
      ...(style ? { style } : {}),
    };
  }
  return undefined;
}

/**
 * 从文本形式的工具或 assistant payload 中提取画布预览。
 */
export function extractCanvasFromText(
  outputText: string | undefined,
  _toolName?: string,
): CanvasPreview | undefined {
  const parsed = tryParseJsonRecord(outputText);
  return coerceCanvasPreview(parsed);
}

/**
 * 从代码块外部提取 [embed ...] 短代码，并返回剥离后的文本。
 */
export function extractCanvasShortcodes(text: string | undefined): {
  text: string;
  previews: CanvasPreview[];
} {
  if (!text?.trim() || !text.toLowerCase().includes('[embed')) {
    return { text: text ?? '', previews: [] };
  }
  const fenceSpans = parseFenceSpans(text);
  const matches: Array<{
    start: number;
    end: number;
    attrs: Record<string, string>;
    body?: string;
  }> = [];
  const blockRe = /\[embed\s+([^\]]*?)\]([\s\S]*?)\[\/embed\]/gi;
  const selfClosingRe = /\[embed\s+([^\]]*?)\/\]/gi;
  for (const re of [blockRe, selfClosingRe]) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const start = match.index ?? 0;
      if (fenceSpans.some((span) => start >= span.start && start < span.end)) {
        continue;
      }
      matches.push({
        start,
        end: start + match[0].length,
        attrs: parseCanvasAttributes(match[1] ?? ''),
        ...(match[2] !== undefined ? { body: match[2] } : {}),
      });
    }
  }
  if (matches.length === 0) {
    return { text, previews: [] };
  }
  matches.sort((a, b) => a.start - b.start);
  const previews: CanvasPreview[] = [];
  let cursor = 0;
  let stripped = '';
  for (const match of matches) {
    if (match.start < cursor) {
      continue;
    }
    stripped += text.slice(cursor, match.start);
    const preview = previewFromShortcode(match.attrs);
    if (!preview) {
      stripped += text.slice(match.start, match.end);
    } else {
      previews.push(preview);
    }
    cursor = match.end;
  }
  stripped += text.slice(cursor);
  return {
    text: stripped.replace(/\n{3,}/g, '\n\n').trim(),
    previews,
  };
}

/**
 * 渲染消息中的画布，返回清理后的文本和画布预览列表。
 */
export function renderCanvases(content: string): {
  cleanText: string;
  canvases: CanvasPreview[];
} {
  const { text, previews } = extractCanvasShortcodes(content);
  return {
    cleanText: text,
    canvases: previews,
  };
}
