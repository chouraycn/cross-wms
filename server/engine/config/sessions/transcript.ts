import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { isValidSessionId, getSessionFilePath } from './paths.js';
import {
  readTranscriptJSONL,
  readTranscriptJSONLPaged,
  writeTranscriptJSONL,
  getMessageCountJSONL,
  searchTranscriptJSONL,
} from './transcript-jsonl.js';
import { TranscriptStream, createTranscriptStream } from './transcript-stream.js';
import { appendMessage, appendMessages, AppendBuffer, createAppendBuffer } from './transcript-append.js';
import type { TranscriptMessage, TranscriptFormat, TranscriptWriteMode } from './types.js';
import type { TranscriptReadResult } from './transcript-jsonl.js';
import type { AppendResult } from './transcript-append.js';
import type { TranscriptWriteOptions } from './transcript-write-context.js';

export class Transcript {
  private baseDir: string;
  private defaultFormat: TranscriptFormat;

  constructor(baseDir: string, defaultFormat: TranscriptFormat = 'jsonl') {
    this.baseDir = baseDir;
    this.defaultFormat = defaultFormat;
  }

  read(
    sessionId: string,
    options: { format?: TranscriptFormat; isArchived?: boolean } = {}
  ): TranscriptReadResult {
    const format = options.format || this.defaultFormat;
    const isArchived = options.isArchived || false;

    switch (format) {
      case 'jsonl':
        return readTranscriptJSONL(this.baseDir, sessionId, isArchived);
      default:
        logger.warn('[Transcript] 不支持的格式，回退到 jsonl:', format);
        return readTranscriptJSONL(this.baseDir, sessionId, isArchived);
    }
  }

  readPaged(
    sessionId: string,
    limit: number = 50,
    beforeIndex?: number,
    options: { format?: TranscriptFormat; isArchived?: boolean } = {}
  ): { messages: TranscriptMessage[]; hasMore: boolean; totalCount: number } {
    const format = options.format || this.defaultFormat;
    const isArchived = options.isArchived || false;

    switch (format) {
      case 'jsonl':
        return readTranscriptJSONLPaged(this.baseDir, sessionId, limit, beforeIndex, isArchived);
      default:
        return { messages: [], hasMore: false, totalCount: 0 };
    }
  }

  write(
    sessionId: string,
    messages: TranscriptMessage[],
    options: { format?: TranscriptFormat; header?: Record<string, unknown> } = {}
  ): boolean {
    if (!isValidSessionId(sessionId)) return false;

    const format = options.format || this.defaultFormat;

    switch (format) {
      case 'jsonl':
        return writeTranscriptJSONL(this.baseDir, sessionId, messages, options.header as any);
      default:
        logger.warn('[Transcript] 不支持的写入格式:', format);
        return false;
    }
  }

  async append(
    sessionId: string,
    message: TranscriptMessage,
    options: { enableAtomic?: boolean } = {}
  ): Promise<AppendResult> {
    return appendMessage(this.baseDir, sessionId, message, options.enableAtomic);
  }

  async appendMany(
    sessionId: string,
    messages: TranscriptMessage[],
    options: { enableAtomic?: boolean } = {}
  ): Promise<AppendResult> {
    return appendMessages(this.baseDir, sessionId, messages, options.enableAtomic);
  }

  createStream(
    sessionId: string,
    options: TranscriptWriteOptions = {}
  ): TranscriptStream {
    const filePath = getSessionFilePath(this.baseDir, sessionId);
    return createTranscriptStream(sessionId, filePath, {
      format: this.defaultFormat,
      ...options,
    });
  }

  createBuffer(
    sessionId: string,
    options: {
      maxSize?: number;
      flushIntervalMs?: number;
      enableAtomic?: boolean;
    } = {}
  ): AppendBuffer {
    return createAppendBuffer(this.baseDir, sessionId, options);
  }

  getMessageCount(
    sessionId: string,
    options: { format?: TranscriptFormat; isArchived?: boolean } = {}
  ): number {
    const format = options.format || this.defaultFormat;
    const isArchived = options.isArchived || false;

    switch (format) {
      case 'jsonl':
        return getMessageCountJSONL(this.baseDir, sessionId, isArchived);
      default:
        return 0;
    }
  }

  search(
    sessionId: string,
    query: string,
    options: { format?: TranscriptFormat; isArchived?: boolean } = {}
  ): Array<{ message: TranscriptMessage; index: number }> {
    const format = options.format || this.defaultFormat;
    const isArchived = options.isArchived || false;

    switch (format) {
      case 'jsonl':
        return searchTranscriptJSONL(this.baseDir, sessionId, query, isArchived);
      default:
        return [];
    }
  }

  exists(sessionId: string, isArchived: boolean = false): boolean {
    if (!isValidSessionId(sessionId)) return false;
    const filePath = getSessionFilePath(this.baseDir, sessionId);
    return fs.existsSync(filePath);
  }

  getSize(sessionId: string): number {
    if (!isValidSessionId(sessionId)) return 0;
    const filePath = getSessionFilePath(this.baseDir, sessionId);
    try {
      return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
    } catch {
      return 0;
    }
  }

  exportToFormat(
    sessionId: string,
    targetFormat: TranscriptFormat,
    outputPath: string
  ): boolean {
    const result = this.read(sessionId);
    if (!result || result.messages.length === 0) return false;

    try {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (targetFormat === 'jsonl') {
        const lines = result.messages.map(m => JSON.stringify({ message: m }));
        fs.writeFileSync(outputPath, lines.join('\n') + '\n', 'utf-8');
      } else if (targetFormat === 'json') {
        fs.writeFileSync(
          outputPath,
          JSON.stringify({
            header: result.header,
            messages: result.messages,
          }, null, 2),
          'utf-8'
        );
      } else if (targetFormat === 'markdown') {
        const md = result.messages.map(m => {
          const role = m.role.toUpperCase();
          const ts = m.timestamp || '';
          return `## ${role} (${ts})\n\n${m.content}\n`;
        }).join('\n');
        fs.writeFileSync(outputPath, md, 'utf-8');
      }

      return true;
    } catch (err) {
      logger.error('[Transcript] 导出失败:', sessionId, targetFormat, err);
      return false;
    }
  }
}

let globalTranscript: Transcript | null = null;

export function getTranscript(baseDir?: string): Transcript {
  if (!globalTranscript && baseDir) {
    globalTranscript = new Transcript(baseDir);
  }
  if (!globalTranscript) {
    throw new Error('Transcript not initialized');
  }
  return globalTranscript;
}
