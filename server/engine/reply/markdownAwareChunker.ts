/**
 * Markdown Aware Chunker
 * Markdown 感知分块器 - 代码块/围栏感知，思考标签剥离，尾部片段处理
 */

import type {
  BlockStreamingChunkingConfig,
  FenceSpan,
  FenceScanState,
} from "./types.js";

const REASONING_TAG_RE =
  /<\s*(\/?)\s*(?:(?:antml:|mm:)?(?:think(?:ing)?|thought|reasoning)|antthinking)\b[^<>]*>/gi;
const FINAL_TAG_RE = /<\s*\/?\s*final\b[^<>]*>/gi;

export function scanFenceSpans(
  buffer: string,
  state?: FenceScanState,
): { spans: FenceSpan[]; state: FenceScanState } {
  const spans: FenceSpan[] = [];
  const startsAtLineStart = state?.atLineStart ?? true;
  let open:
    | {
        start: number;
        markerChar: string;
        markerLen: number;
        openLine: string;
        marker: string;
        indent: string;
      }
    | undefined = state?.open ? { ...state.open, start: 0 } : undefined;

  let offset = 0;
  while (offset <= buffer.length) {
    const nextNewline = buffer.indexOf("\n", offset);
    const lineEnd = nextNewline === -1 ? buffer.length : nextNewline;
    const line = buffer.slice(offset, lineEnd);

    const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/);
    if (match && (offset > 0 || startsAtLineStart)) {
      const indent = match[1];
      const marker = match[2];
      const markerChar = marker[0];
      const markerLen = marker.length;
      if (!open) {
        open = {
          start: offset,
          markerChar,
          markerLen,
          openLine: line,
          marker,
          indent,
        };
      } else if (open.markerChar === markerChar && markerLen >= open.markerLen) {
        const end = lineEnd;
        spans.push({
          start: open.start,
          end,
          openLine: open.openLine,
          marker: open.marker,
          indent: open.indent,
        });
        open = undefined;
      }
    }

    if (nextNewline === -1) {
      break;
    }
    offset = nextNewline + 1;
  }

  if (open) {
    spans.push({
      start: open.start,
      end: buffer.length,
      openLine: open.openLine,
      marker: open.marker,
      indent: open.indent,
    });
  }

  const atLineStart = buffer.length === 0 ? startsAtLineStart : buffer.endsWith("\n");
  const nextState: FenceScanState = {
    atLineStart,
    ...(open
      ? {
          open: {
            markerChar: open.markerChar,
            markerLen: open.markerLen,
            openLine: open.openLine,
            marker: open.marker,
            indent: open.indent,
          },
        }
      : {}),
  };
  return { spans, state: nextState };
}

export function parseFenceSpans(buffer: string): FenceSpan[] {
  return scanFenceSpans(buffer).spans;
}

export function findFenceSpanAt(spans: FenceSpan[], index: number): FenceSpan | undefined {
  let low = 0;
  let high = spans.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const span = spans[mid];
    if (!span) {
      break;
    }
    if (index <= span.start) {
      high = mid - 1;
      continue;
    }
    if (index >= span.end) {
      low = mid + 1;
      continue;
    }
    return span;
  }

  return undefined;
}

export function isSafeFenceBreak(spans: FenceSpan[], index: number): boolean {
  return !findFenceSpanAt(spans, index);
}

export function stripReasoningTagsFromText(text: string): string {
  if (!text) {
    return text;
  }

  const cleaned = text.replace(FINAL_TAG_RE, "");

  const codeRegions = findCodeRegions(cleaned);

  REASONING_TAG_RE.lastIndex = 0;
  let result = "";
  let lastIndex = 0;
  let thinkingDepth = 0;

  for (const match of cleaned.matchAll(REASONING_TAG_RE)) {
    const idx = match.index ?? 0;
    const isClose = match[1] === "/";

    if (isInsideCode(idx, codeRegions)) {
      continue;
    }

    if (thinkingDepth === 0) {
      if (isClose) {
        result += cleaned.slice(lastIndex, idx);
        lastIndex = idx + match[0].length;
        continue;
      }
      result += cleaned.slice(lastIndex, idx);
      thinkingDepth = 1;
    } else if (isClose) {
      thinkingDepth -= 1;
    } else {
      thinkingDepth += 1;
    }

    lastIndex = idx + match[0].length;
  }

  if (thinkingDepth === 0) {
    result += cleaned.slice(lastIndex);
  }

  return result.trim();
}

function findCodeRegions(text: string): Array<{ start: number; end: number }> {
  const regions: Array<{ start: number; end: number }> = [];
  const spans = parseFenceSpans(text);
  for (const span of spans) {
    regions.push({ start: span.start, end: span.end });
  }

  const inlineCodeRe = /`[^`\n]*`/g;
  let match: RegExpExecArray | null;
  while ((match = inlineCodeRe.exec(text)) !== null) {
    regions.push({ start: match.index, end: match.index + match[0].length });
  }

  return regions.sort((a, b) => a.start - b.start);
}

function isInsideCode(index: number, regions: Array<{ start: number; end: number }>): boolean {
  for (const region of regions) {
    if (index >= region.start && index < region.end) {
      return true;
    }
  }
  return false;
}

type ParagraphBreak = {
  index: number;
  length: number;
};

function findSafeSentenceBreakIndex(
  text: string,
  fenceSpans: FenceSpan[],
  minChars: number,
  offset = 0,
): number {
  const matches = text.matchAll(/[.!?](?=\s|$)/g);
  let sentenceIdx = -1;
  for (const match of matches) {
    const at = match.index ?? -1;
    if (at < minChars) {
      continue;
    }
    const candidate = at + 1;
    if (isSafeFenceBreak(fenceSpans, offset + candidate)) {
      sentenceIdx = candidate;
    }
  }
  return sentenceIdx >= minChars ? sentenceIdx : -1;
}

function findSafeParagraphBreakIndex(params: {
  text: string;
  fenceSpans: FenceSpan[];
  minChars: number;
  reverse: boolean;
  offset?: number;
}): number {
  const { text, fenceSpans, minChars, reverse, offset = 0 } = params;
  let paragraphIdx = reverse ? text.lastIndexOf("\n\n") : text.indexOf("\n\n");
  while (reverse ? paragraphIdx >= minChars : paragraphIdx !== -1) {
    const candidates = [paragraphIdx, paragraphIdx + 1];
    for (const candidate of candidates) {
      if (candidate < minChars) {
        continue;
      }
      if (candidate < 0 || candidate >= text.length) {
        continue;
      }
      if (isSafeFenceBreak(fenceSpans, offset + candidate)) {
        return candidate;
      }
    }
    paragraphIdx = reverse
      ? text.lastIndexOf("\n\n", paragraphIdx - 1)
      : text.indexOf("\n\n", paragraphIdx + 2);
  }
  return -1;
}

function findSafeNewlineBreakIndex(params: {
  text: string;
  fenceSpans: FenceSpan[];
  minChars: number;
  reverse: boolean;
  offset?: number;
}): number {
  const { text, fenceSpans, minChars, reverse, offset = 0 } = params;
  let newlineIdx = reverse ? text.lastIndexOf("\n") : text.indexOf("\n");
  while (reverse ? newlineIdx >= minChars : newlineIdx !== -1) {
    if (newlineIdx >= minChars && isSafeFenceBreak(fenceSpans, offset + newlineIdx)) {
      return newlineIdx;
    }
    newlineIdx = reverse
      ? text.lastIndexOf("\n", newlineIdx - 1)
      : text.indexOf("\n", newlineIdx + 1);
  }
  return -1;
}

function findFenceCloseLineStart(buffer: string, fence: FenceSpan, offset = 0): number {
  const relativeFenceEnd = Math.min(buffer.length, Math.max(0, fence.end - offset));
  if (relativeFenceEnd <= 0) {
    return -1;
  }
  const lastNewline = buffer.lastIndexOf("\n", relativeFenceEnd - 1);
  return lastNewline >= 0 ? lastNewline + 1 : -1;
}

function findNextParagraphBreak(
  buffer: string,
  fenceSpans: FenceSpan[],
  startIndex = 0,
  minCharsFromStart = 1,
): ParagraphBreak | null {
  if (startIndex < 0) {
    return null;
  }
  const re = /\n[\t ]*\n+/g;
  re.lastIndex = startIndex;
  let match: RegExpExecArray | null;
  while ((match = re.exec(buffer)) !== null) {
    const index = match.index ?? -1;
    if (index < 0) {
      continue;
    }
    if (index - startIndex < minCharsFromStart) {
      continue;
    }
    if (!isSafeFenceBreak(fenceSpans, index)) {
      continue;
    }
    return { index, length: match[0].length };
  }
  return null;
}

function skipLeadingNewlines(value: string, start = 0): number {
  let i = start;
  while (i < value.length && value[i] === "\n") {
    i++;
  }
  return i;
}

function stripLeadingNewlines(value: string): string {
  const start = skipLeadingNewlines(value);
  return start > 0 ? value.slice(start) : value;
}

type FenceSplit = {
  closeFenceLine: string;
  reopenFenceLine: string;
  fence: FenceSpan;
};

type BreakResult = {
  index: number;
  fenceSplit?: FenceSplit;
};

export class MarkdownAwareChunker {
  private buffer = "";
  private readonly chunking: BlockStreamingChunkingConfig;
  private blockIndex = 0;

  constructor(chunking: BlockStreamingChunkingConfig) {
    this.chunking = chunking;
  }

  append(text: string): void {
    if (!text) {
      return;
    }
    this.buffer += text;
  }

  reset(): void {
    this.buffer = "";
    this.blockIndex = 0;
  }

  get bufferedText(): string {
    return this.buffer;
  }

  hasBuffered(): boolean {
    return this.buffer.length > 0;
  }

  drain(params: { force: boolean; emit: (chunk: string) => void }): void {
    const { force, emit } = params;
    const minChars = Math.max(1, Math.floor(this.chunking.minChars));
    const maxChars = Math.max(minChars, Math.floor(this.chunking.maxChars));

    if (this.buffer.length < minChars && !force) {
      return;
    }

    if (force && this.buffer.length <= maxChars) {
      if (this.buffer.trim().length > 0) {
        emit(this.buffer);
        this.blockIndex++;
      }
      this.buffer = "";
      return;
    }

    const source = this.buffer;
    const fenceSpans = parseFenceSpans(source);
    let start = 0;
    let reopenFence: FenceSpan | undefined;

    while (start < source.length) {
      const reopenPrefix = reopenFence ? `${reopenFence.openLine}\n` : "";
      const remainingLength = reopenPrefix.length + (source.length - start);

      if (!force && remainingLength < minChars) {
        break;
      }

      if (this.chunking.flushOnParagraph && !force) {
        const paragraphBreak = findNextParagraphBreak(source, fenceSpans, start, minChars);
        const paragraphLimit = Math.max(1, maxChars - reopenPrefix.length);
        if (paragraphBreak && paragraphBreak.index - start <= paragraphLimit) {
          const chunk = `${reopenPrefix}${source.slice(start, paragraphBreak.index)}`;
          if (chunk.trim().length > 0) {
            emit(chunk);
            this.blockIndex++;
          }
          start = skipLeadingNewlines(source, paragraphBreak.index + paragraphBreak.length);
          reopenFence = undefined;
          continue;
        }
        if (remainingLength < maxChars) {
          break;
        }
      }

      const view = source.slice(start);
      const breakResult =
        force && remainingLength <= maxChars
          ? this.pickSoftBreakIndex(view, fenceSpans, 1, start)
          : this.pickBreakIndex(view, fenceSpans, force ? 1 : undefined, start);
      if (breakResult.index <= 0) {
        if (force) {
          emit(`${reopenPrefix}${source.slice(start)}`);
          this.blockIndex++;
          start = source.length;
          reopenFence = undefined;
        }
        break;
      }

      const consumed = this.emitBreakResult({
        breakResult,
        emit,
        reopenPrefix,
        source,
        start,
      });
      if (consumed === null) {
        continue;
      }
      start = consumed.start;
      reopenFence = consumed.reopenFence;

      const nextLength =
        (reopenFence ? `${reopenFence.openLine}\n`.length : 0) + (source.length - start);
      if (nextLength < minChars && !force) {
        break;
      }
      if (nextLength < maxChars && !force && !this.chunking.flushOnParagraph) {
        break;
      }
    }
    this.buffer = reopenFence
      ? `${reopenFence.openLine}\n${source.slice(start)}`
      : stripLeadingNewlines(source.slice(start));
  }

  private emitBreakResult(params: {
    breakResult: BreakResult;
    emit: (chunk: string) => void;
    reopenPrefix: string;
    source: string;
    start: number;
  }): { start: number; reopenFence?: FenceSpan } | null {
    const { breakResult, emit, reopenPrefix, source, start } = params;
    const breakIdx = breakResult.index;
    if (breakIdx <= 0) {
      return null;
    }

    const absoluteBreakIdx = start + breakIdx;
    let rawChunk = `${reopenPrefix}${source.slice(start, absoluteBreakIdx)}`;
    if (rawChunk.trim().length === 0) {
      return { start: skipLeadingNewlines(source, absoluteBreakIdx), reopenFence: undefined };
    }

    const fenceSplit = breakResult.fenceSplit;
    if (fenceSplit) {
      const closeFence = rawChunk.endsWith("\n")
        ? `${fenceSplit.closeFenceLine}\n`
        : `\n${fenceSplit.closeFenceLine}\n`;
      rawChunk = `${rawChunk}${closeFence}`;
    }

    emit(rawChunk);
    this.blockIndex++;

    if (fenceSplit) {
      return { start: absoluteBreakIdx, reopenFence: fenceSplit.fence };
    }

    const nextStart =
      absoluteBreakIdx < source.length && /\s/.test(source[absoluteBreakIdx])
        ? absoluteBreakIdx + 1
        : absoluteBreakIdx;
    return { start: skipLeadingNewlines(source, nextStart), reopenFence: undefined };
  }

  private pickSoftBreakIndex(
    buffer: string,
    fenceSpans: FenceSpan[],
    minCharsOverride?: number,
    offset = 0,
  ): BreakResult {
    const minChars = Math.max(1, Math.floor(minCharsOverride ?? this.chunking.minChars));
    if (buffer.length < minChars) {
      return { index: -1 };
    }
    const preference = this.chunking.breakPreference;

    if (preference === "paragraph") {
      const paragraphIdx = findSafeParagraphBreakIndex({
        text: buffer,
        fenceSpans,
        minChars,
        reverse: false,
        offset,
      });
      if (paragraphIdx !== -1) {
        return { index: paragraphIdx };
      }
    }

    if (preference === "paragraph" || preference === "newline") {
      const newlineIdx = findSafeNewlineBreakIndex({
        text: buffer,
        fenceSpans,
        minChars,
        reverse: false,
        offset,
      });
      if (newlineIdx !== -1) {
        return { index: newlineIdx };
      }
    }

    if (preference !== "newline") {
      const sentenceIdx = findSafeSentenceBreakIndex(buffer, fenceSpans, minChars, offset);
      if (sentenceIdx !== -1) {
        return { index: sentenceIdx };
      }
    }

    return { index: -1 };
  }

  private pickBreakIndex(
    buffer: string,
    fenceSpans: FenceSpan[],
    minCharsOverride?: number,
    offset = 0,
  ): BreakResult {
    const minChars = Math.max(1, Math.floor(minCharsOverride ?? this.chunking.minChars));
    const maxChars = Math.max(minChars, Math.floor(this.chunking.maxChars));
    if (buffer.length < minChars) {
      return { index: -1 };
    }
    const window = buffer.slice(0, Math.min(maxChars, buffer.length));

    const preference = this.chunking.breakPreference;
    if (preference === "paragraph") {
      const paragraphIdx = findSafeParagraphBreakIndex({
        text: window,
        fenceSpans,
        minChars,
        reverse: true,
        offset,
      });
      if (paragraphIdx !== -1) {
        return { index: paragraphIdx };
      }
    }

    if (preference === "paragraph" || preference === "newline") {
      const newlineIdx = findSafeNewlineBreakIndex({
        text: window,
        fenceSpans,
        minChars,
        reverse: true,
        offset,
      });
      if (newlineIdx !== -1) {
        return { index: newlineIdx };
      }
    }

    if (preference !== "newline") {
      const sentenceIdx = findSafeSentenceBreakIndex(window, fenceSpans, minChars, offset);
      if (sentenceIdx !== -1) {
        return { index: sentenceIdx };
      }
    }

    if (preference === "newline" && buffer.length < maxChars) {
      return { index: -1 };
    }

    for (let i = window.length - 1; i >= minChars; i--) {
      if (/\s/.test(window[i]) && isSafeFenceBreak(fenceSpans, offset + i)) {
        return { index: i };
      }
    }

    if (buffer.length >= maxChars) {
      if (isSafeFenceBreak(fenceSpans, offset + maxChars)) {
        return { index: maxChars };
      }
      const fence = findFenceSpanAt(fenceSpans, offset + maxChars);
      if (fence) {
        const closeFenceStart = findFenceCloseLineStart(buffer, fence, offset);
        if (closeFenceStart >= minChars && closeFenceStart < maxChars) {
          return {
            index: closeFenceStart,
            fenceSplit: {
              closeFenceLine: `${fence.indent}${fence.marker}`,
              reopenFenceLine: fence.openLine,
              fence,
            },
          };
        }
        return {
          index: maxChars,
          fenceSplit: {
            closeFenceLine: `${fence.indent}${fence.marker}`,
            reopenFenceLine: fence.openLine,
            fence,
          },
        };
      }
      return { index: maxChars };
    }

    return { index: -1 };
  }

  get currentBlockIndex(): number {
    return this.blockIndex;
  }
}
