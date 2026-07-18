import type { TranscriptMessage, TranscriptFormat, TranscriptWriteMode } from './types.js';
import type { TranscriptHeader } from './transcript-header.js';

export interface TranscriptWriteContext {
  sessionId: string;
  filePath: string;
  format: TranscriptFormat;
  mode: TranscriptWriteMode;
  header: TranscriptHeader;
  messageCount: number;
  bytesWritten: number;
  startedAt: number;
  isOpen: boolean;
  stream?: WritableStream<string> | null;
  flushIntervalMs: number;
  lastFlushAt: number;
  buffer: string[];
  bufferSize: number;
  maxBufferSize: number;
  error?: Error;
}

export interface TranscriptWriteOptions {
  format?: TranscriptFormat;
  mode?: TranscriptWriteMode;
  maxBufferSize?: number;
  flushIntervalMs?: number;
  header?: Partial<TranscriptHeader>;
}

const DEFAULT_OPTIONS: Required<Pick<TranscriptWriteOptions, 'format' | 'mode' | 'maxBufferSize' | 'flushIntervalMs'>> = {
  format: 'jsonl',
  mode: 'append',
  maxBufferSize: 100,
  flushIntervalMs: 5000,
};

export function createWriteContext(
  sessionId: string,
  filePath: string,
  options: TranscriptWriteOptions = {}
): TranscriptWriteContext {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return {
    sessionId,
    filePath,
    format: opts.format,
    mode: opts.mode,
    header: {
      sessionId,
      schemaVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      format: opts.format,
      messageCount: 0,
      metadata: {},
      ...options.header,
    },
    messageCount: 0,
    bytesWritten: 0,
    startedAt: Date.now(),
    isOpen: false,
    stream: null,
    flushIntervalMs: opts.flushIntervalMs,
    lastFlushAt: Date.now(),
    buffer: [],
    bufferSize: 0,
    maxBufferSize: opts.maxBufferSize,
  };
}

export function shouldFlush(context: TranscriptWriteContext): boolean {
  if (context.bufferSize >= context.maxBufferSize) return true;
  if (Date.now() - context.lastFlushAt >= context.flushIntervalMs && context.bufferSize > 0) return true;
  return false;
}

export function addToBuffer(
  context: TranscriptWriteContext,
  line: string
): TranscriptWriteContext {
  context.buffer.push(line);
  context.bufferSize += line.length + 1;
  context.messageCount++;
  return context;
}

export function clearBuffer(context: TranscriptWriteContext): string[] {
  const lines = [...context.buffer];
  context.buffer = [];
  context.bufferSize = 0;
  context.lastFlushAt = Date.now();
  return lines;
}

export function closeContext(context: TranscriptWriteContext): void {
  context.isOpen = false;
  context.stream = null;
}

export function formatMessageLine(
  message: TranscriptMessage,
  format: TranscriptFormat
): string {
  switch (format) {
    case 'jsonl':
      return JSON.stringify({ message });
    case 'json':
      return JSON.stringify(message);
    case 'markdown':
      return formatMessageAsMarkdown(message);
    default:
      return JSON.stringify({ message });
  }
}

function formatMessageAsMarkdown(message: TranscriptMessage): string {
  const role = message.role.toUpperCase();
  const timestamp = message.timestamp || new Date().toISOString();
  return `## ${role} (${timestamp})\n\n${message.content}\n`;
}
