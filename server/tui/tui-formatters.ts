const REPLACEMENT_CHAR_RE = /\uFFFD/g;
const MAX_TOKEN_CHARS = 32;
const LONG_TOKEN_RE = /\S{33,}/g;
const LONG_TOKEN_TEST_RE = /\S{33,}/;
const BINARY_LINE_REPLACEMENT_THRESHOLD = 12;
const URL_PREFIX_RE = /^(https?:\/\/|file:\/\/)/i;
const WINDOWS_DRIVE_RE = /^[a-zA-Z]:[\\/]/;
const FILE_LIKE_RE = /^[a-zA-Z0-9._-]+$/;
const EDGE_PUNCTUATION_RE = /^[`"'([{<]+|[`"')\]}>.,:;!?]+$/g;
const ALPHANUMERIC_RE = /[A-Za-z0-9]/;
const TOKENISH_MIN_LENGTH = 24;
const FENCED_CODE_RE = /(```|~~~)[^\n]*\n[\s\S]*?\n\1[^\n]*/g;
const INLINE_CODE_RE = /(`+)(?:(?!\1).)+?\1/g;

function hasControlChars(text: string): boolean {
  for (const char of text) {
    const code = char.charCodeAt(0);
    const isAsciiControl = code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    const isC1Control = code >= 0x7f && code <= 0x9f;
    if (isAsciiControl || isC1Control) {
      return true;
    }
  }
  return false;
}

function stripControlChars(text: string): string {
  if (!hasControlChars(text)) {
    return text;
  }
  let sanitized = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    const isAsciiControl = code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    const isC1Control = code >= 0x7f && code <= 0x9f;
    if (!isAsciiControl && !isC1Control) {
      sanitized += char;
    }
  }
  return sanitized;
}

function stripAnsi(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/\x1b\[[0-9;]*m/g, '');
}

function chunkToken(token: string, maxChars: number): string[] {
  if (token.length <= maxChars) {
    return [token];
  }
  const chunks: string[] = [];
  for (let i = 0; i < token.length; i += maxChars) {
    chunks.push(token.slice(i, i + maxChars));
  }
  return chunks;
}

function isCopySensitiveToken(token: string): boolean {
  const coreToken = token.replace(EDGE_PUNCTUATION_RE, '');
  const candidate = coreToken || token;

  if (URL_PREFIX_RE.test(candidate)) {
    return true;
  }
  if (
    candidate.startsWith('/') ||
    candidate.startsWith('~/') ||
    candidate.startsWith('./') ||
    candidate.startsWith('../')
  ) {
    return true;
  }
  if (WINDOWS_DRIVE_RE.test(candidate) || candidate.startsWith('\\\\')) {
    return true;
  }
  if (candidate.includes('/') || candidate.includes('\\')) {
    return true;
  }
  if (
    FILE_LIKE_RE.test(candidate) &&
    (candidate.includes('_') || candidate.includes('-') || candidate.includes('.'))
  ) {
    return true;
  }

  if (candidate.length >= TOKENISH_MIN_LENGTH && /[a-z]/i.test(candidate) && /\d/.test(candidate)) {
    return true;
  }
  return false;
}

function normalizeLongTokenForDisplay(token: string): string {
  if (isCopySensitiveToken(token)) {
    return token;
  }
  if (!ALPHANUMERIC_RE.test(token)) {
    return token;
  }
  return chunkToken(token, MAX_TOKEN_CHARS).join(' ');
}

type Segment = { kind: 'prose' | 'code'; text: string };

function partitionByRegex(text: string, re: RegExp): Segment[] {
  const parts: Segment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      parts.push({ kind: 'prose', text: text.slice(lastIndex, start) });
    }
    parts.push({ kind: 'code', text: match[0] });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ kind: 'prose', text: text.slice(lastIndex) });
  }
  return parts;
}

function transformOutsideCode(text: string, transform: (segment: string) => string): string {
  const fenced = partitionByRegex(text, FENCED_CODE_RE);
  return fenced
    .map((seg) => {
      if (seg.kind === 'code') {
        return seg.text;
      }
      const inline = partitionByRegex(seg.text, INLINE_CODE_RE);
      return inline.map((s) => (s.kind === 'code' ? s.text : transform(s.text))).join('');
    })
    .join('');
}

function redactBinaryLikeLine(line: string): string {
  const replacementCount = (line.match(REPLACEMENT_CHAR_RE) || []).length;
  if (
    replacementCount >= BINARY_LINE_REPLACEMENT_THRESHOLD &&
    replacementCount * 2 >= line.length
  ) {
    return '[binary data omitted]';
  }
  return line;
}

export function sanitizeRenderableText(text: string): string {
  if (!text) {
    return text;
  }

  const hasAnsi = text.includes('\u001b');
  const hasReplacementChars = text.includes('\uFFFD');
  const hasLongTokens = LONG_TOKEN_TEST_RE.test(text);
  const hasControls = hasControlChars(text);
  if (!hasAnsi && !hasReplacementChars && !hasLongTokens && !hasControls) {
    return text;
  }

  const withoutAnsi = hasAnsi ? stripAnsi(text) : text;
  const withoutControlChars = hasControls ? stripControlChars(withoutAnsi) : withoutAnsi;
  const redacted = hasReplacementChars
    ? withoutControlChars
        .split('\n')
        .map((line) => redactBinaryLikeLine(line))
        .join('\n')
    : withoutControlChars;
  const tokenSafe = LONG_TOKEN_TEST_RE.test(redacted)
    ? transformOutsideCode(redacted, (segment) =>
        LONG_TOKEN_TEST_RE.test(segment)
          ? segment.replace(LONG_TOKEN_RE, normalizeLongTokenForDisplay)
          : segment,
      )
    : redacted;
  return tokenSafe;
}

export function resolveFinalAssistantText(params: {
  finalText?: string | null;
  streamedText?: string | null;
  errorMessage?: string | null;
}) {
  const finalText = params.finalText ?? '';
  if (finalText.trim()) {
    return finalText;
  }
  const streamedText = params.streamedText ?? '';
  if (streamedText.trim()) {
    return streamedText;
  }
  const errorMessage = params.errorMessage ?? '';
  if (errorMessage.trim()) {
    return `Error: ${errorMessage}`;
  }
  return '(no output)';
}

export function composeThinkingAndContent(params: {
  thinkingText?: string;
  contentText?: string;
  showThinking?: boolean;
}) {
  const thinkingText = params.thinkingText?.trim() ?? '';
  const contentText = params.contentText?.trim() ?? '';
  const parts: string[] = [];

  if (params.showThinking && thinkingText) {
    parts.push(`[thinking]\n${thinkingText}`);
  }
  if (contentText) {
    parts.push(contentText);
  }

  return parts.join('\n\n').trim();
}

function asMessageRecord(message: unknown): Record<string, unknown> | undefined {
  if (!message || typeof message !== 'object') {
    return undefined;
  }
  return message as Record<string, unknown>;
}

function resolveMessageRecord(
  message: unknown,
): { record: Record<string, unknown>; content: unknown } | undefined {
  const record = asMessageRecord(message);
  if (!record) {
    return undefined;
  }
  return { record, content: record.content };
}

function collectSanitizedBlockStrings(params: {
  content: unknown;
  blockType: 'text' | 'thinking';
  valueKey: 'text' | 'thinking';
}): string[] {
  if (!Array.isArray(params.content)) {
    return [];
  }
  const parts: string[] = [];
  for (const block of params.content) {
    if (!block || typeof block !== 'object') {
      continue;
    }
    const rec = block as Record<string, unknown>;
    if (rec.type === params.blockType && typeof rec[params.valueKey] === 'string') {
      parts.push(sanitizeRenderableText(rec[params.valueKey] as string));
    }
  }
  return parts;
}

export function extractThinkingFromMessage(message: unknown): string {
  const resolved = resolveMessageRecord(message);
  if (!resolved) {
    return '';
  }
  const { content } = resolved;
  if (typeof content === 'string') {
    return '';
  }
  const parts = collectSanitizedBlockStrings({
    content,
    blockType: 'thinking',
    valueKey: 'thinking',
  });
  return parts.join('\n').trim();
}

export function extractContentFromMessage(message: unknown): string {
  const resolved = resolveMessageRecord(message);
  if (!resolved) {
    return '';
  }
  const { record, content } = resolved;

  if (record.role === 'assistant') {
    if (typeof content === 'string') {
      return sanitizeRenderableText(content).trim();
    }
    if (Array.isArray(content)) {
      const parts = collectSanitizedBlockStrings({
        content,
        blockType: 'text',
        valueKey: 'text',
      });
      if (parts.length > 0) {
        return parts.join('\n').trim();
      }
    }
  }

  if (typeof content === 'string') {
    return sanitizeRenderableText(content).trim();
  }

  const parts = collectSanitizedBlockStrings({
    content,
    blockType: 'text',
    valueKey: 'text',
  });
  if (parts.length > 0) {
    return parts.join('\n').trim();
  }
  return '';
}

export function isCommandMessage(message: unknown): boolean {
  if (!message || typeof message !== 'object') {
    return false;
  }
  return (message as Record<string, unknown>).command === true;
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

export function wordWrap(text: string, width: number): string[] {
  if (width <= 0) {
    return [text];
  }
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  for (const paragraph of paragraphs) {
    if (paragraph === '') {
      lines.push('');
      continue;
    }

    let currentLine = '';
    const words = paragraph.split(/(\s+)/);

    for (const word of words) {
      if (currentLine.length + word.length > width && currentLine.length > 0) {
        lines.push(currentLine.trimEnd());
        currentLine = word.trimStart();
      } else {
        currentLine += word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines;
}

export function indentText(lines: string[], indent: number): string[] {
  const prefix = ' '.repeat(indent);
  return lines.map((line) => (line.length > 0 ? prefix + line : line));
}
