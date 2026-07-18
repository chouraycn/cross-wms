import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { isValidSessionId, getSessionFilePath } from './paths.js';
import type { TranscriptMessage, TranscriptFormat } from './types.js';
import { TranscriptMessageSchema } from './types.js';
import { parseTranscriptHeader } from './transcript-header.js';
import type { TranscriptHeader } from './transcript-header.js';

export interface TranscriptReadResult {
  header: TranscriptHeader | null;
  messages: TranscriptMessage[];
  totalLines: number;
  error?: Error;
}

export function readTranscriptJSONL(
  baseDir: string,
  sessionId: string,
  isArchived: boolean = false
): TranscriptReadResult {
  const result: TranscriptReadResult = {
    header: null,
    messages: [],
    totalLines: 0,
  };

  if (!isValidSessionId(sessionId)) {
    result.error = new Error('Invalid session ID');
    return result;
  }

  const filePath = getSessionFilePath(baseDir, sessionId);

  try {
    if (!fs.existsSync(filePath)) {
      return result;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    result.totalLines = lines.length;

    if (lines.length === 0) {
      return result;
    }

    result.header = parseTranscriptHeader(lines[0]);

    for (let i = 1; i < lines.length; i++) {
      try {
        const lineData = JSON.parse(lines[i]);
        const message = lineData.message || lineData;

        const parsed = TranscriptMessageSchema.safeParse(message);
        if (parsed.success) {
          result.messages.push(parsed.data);
        } else {
          logger.debug('[TranscriptJSONL] 跳过无效消息行:', i, parsed.error.issues);
        }
      } catch {
        logger.debug('[TranscriptJSONL] 跳过无法解析的行:', i);
      }
    }

    if (result.header) {
      result.header.messageCount = result.messages.length;
    }

    return result;
  } catch (err) {
    logger.error('[TranscriptJSONL] 读取转录失败:', sessionId, err);
    result.error = err as Error;
    return result;
  }
}

export function readTranscriptJSONLPaged(
  baseDir: string,
  sessionId: string,
  limit: number = 50,
  beforeIndex?: number,
  isArchived: boolean = false
): {
  messages: TranscriptMessage[];
  hasMore: boolean;
  totalCount: number;
} {
  if (!isValidSessionId(sessionId)) {
    return { messages: [], hasMore: false, totalCount: 0 };
  }

  const filePath = getSessionFilePath(baseDir, sessionId);

  try {
    if (!fs.existsSync(filePath)) {
      return { messages: [], hasMore: false, totalCount: 0 };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const totalMessages = Math.max(0, lines.length - 1);

    let endIndex = beforeIndex !== undefined ? beforeIndex + 1 : lines.length;
    endIndex = Math.min(endIndex, lines.length);
    const startIndex = Math.max(1, endIndex - limit);

    const messages: TranscriptMessage[] = [];
    for (let i = startIndex; i < endIndex; i++) {
      try {
        const lineData = JSON.parse(lines[i]);
        const message = lineData.message || lineData;
        const parsed = TranscriptMessageSchema.safeParse(message);
        if (parsed.success) {
          messages.push(parsed.data);
        }
      } catch {
        // skip
      }
    }

    const hasMore = startIndex > 1;

    return { messages, hasMore, totalCount: totalMessages };
  } catch (err) {
    logger.error('[TranscriptJSONL] 分页读取失败:', sessionId, err);
    return { messages: [], hasMore: false, totalCount: 0 };
  }
}

export function writeTranscriptJSONL(
  baseDir: string,
  sessionId: string,
  messages: TranscriptMessage[],
  header?: Partial<TranscriptHeader>
): boolean {
  if (!isValidSessionId(sessionId)) return false;

  const filePath = getSessionFilePath(baseDir, sessionId);

  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const headerLine = JSON.stringify({
      header: {
        sessionId,
        schemaVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        format: 'jsonl' as const,
        messageCount: messages.length,
        ...header,
      },
    });

    const lines = [headerLine];
    for (const msg of messages) {
      lines.push(JSON.stringify({ message: msg }));
    }

    const content = lines.join('\n') + '\n';
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    logger.error('[TranscriptJSONL] 写入转录失败:', sessionId, err);
    return false;
  }
}

export function appendToTranscriptJSONL(
  baseDir: string,
  sessionId: string,
  message: TranscriptMessage
): boolean {
  if (!isValidSessionId(sessionId)) return false;

  const filePath = getSessionFilePath(baseDir, sessionId);

  try {
    const line = JSON.stringify({ message }) + '\n';
    const fd = fs.openSync(filePath, 'a');
    try {
      fs.writeSync(fd, line);
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (err) {
    logger.error('[TranscriptJSONL] 追加写入失败:', sessionId, err);
    return false;
  }
}

export function appendManyToTranscriptJSONL(
  baseDir: string,
  sessionId: string,
  messages: TranscriptMessage[]
): boolean {
  if (!isValidSessionId(sessionId)) return false;

  const filePath = getSessionFilePath(baseDir, sessionId);

  try {
    const lines = messages.map(m => JSON.stringify({ message: m }));
    const content = lines.join('\n') + '\n';

    const fd = fs.openSync(filePath, 'a');
    try {
      fs.writeSync(fd, content);
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (err) {
    logger.error('[TranscriptJSONL] 批量追加失败:', sessionId, err);
    return false;
  }
}

export function getMessageCountJSONL(
  baseDir: string,
  sessionId: string,
  isArchived: boolean = false
): number {
  if (!isValidSessionId(sessionId)) return 0;

  const filePath = getSessionFilePath(baseDir, sessionId);

  try {
    if (!fs.existsSync(filePath)) return 0;

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    return Math.max(0, lines.length - 1);
  } catch {
    return 0;
  }
}

export function searchTranscriptJSONL(
  baseDir: string,
  sessionId: string,
  query: string,
  isArchived: boolean = false
): Array<{ message: TranscriptMessage; index: number }> {
  if (!query || !query.trim()) return [];

  const result = readTranscriptJSONL(baseDir, sessionId, isArchived);
  const lowerQuery = query.toLowerCase();
  const matches: Array<{ message: TranscriptMessage; index: number }> = [];

  for (let i = 0; i < result.messages.length; i++) {
    const msg = result.messages[i];
    if (msg.content?.toLowerCase().includes(lowerQuery)) {
      matches.push({ message: msg, index: i });
    }
  }

  return matches;
}
