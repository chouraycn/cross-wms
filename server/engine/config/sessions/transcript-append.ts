import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { getTempFilePath, getSessionFilePath, isValidSessionId } from './paths.js';
import type { TranscriptMessage } from './types.js';
import { appendToTranscriptJSONL, appendManyToTranscriptJSONL } from './transcript-jsonl.js';

export interface AppendResult {
  success: boolean;
  appended: number;
  bytesWritten: number;
  error?: Error;
}

export async function appendMessage(
  baseDir: string,
  sessionId: string,
  message: TranscriptMessage,
  enableAtomic: boolean = true
): Promise<AppendResult> {
  const startTime = Date.now();

  if (!isValidSessionId(sessionId)) {
    return {
      success: false,
      appended: 0,
      bytesWritten: 0,
      error: new Error('Invalid session ID'),
    };
  }

  try {
    const line = JSON.stringify({ message });
    const bytesWritten = Buffer.byteLength(line, 'utf-8') + 1;

    if (enableAtomic) {
      const success = await atomicAppend(baseDir, sessionId, line);
      return {
        success,
        appended: success ? 1 : 0,
        bytesWritten: success ? bytesWritten : 0,
      };
    }

    const success = appendToTranscriptJSONL(baseDir, sessionId, message);
    return {
      success,
      appended: success ? 1 : 0,
      bytesWritten: success ? bytesWritten : 0,
    };
  } catch (err) {
    logger.error('[TranscriptAppend] 追加消息失败:', sessionId, err);
    return {
      success: false,
      appended: 0,
      bytesWritten: 0,
      error: err as Error,
    };
  }
}

export async function appendMessages(
  baseDir: string,
  sessionId: string,
  messages: TranscriptMessage[],
  enableAtomic: boolean = true
): Promise<AppendResult> {
  if (!isValidSessionId(sessionId)) {
    return {
      success: false,
      appended: 0,
      bytesWritten: 0,
      error: new Error('Invalid session ID'),
    };
  }

  if (messages.length === 0) {
    return { success: true, appended: 0, bytesWritten: 0 };
  }

  try {
    const lines = messages.map(m => JSON.stringify({ message: m }));
    const content = lines.join('\n') + '\n';
    const bytesWritten = Buffer.byteLength(content, 'utf-8');

    if (enableAtomic) {
      const success = await atomicAppendMany(baseDir, sessionId, content);
      return {
        success,
        appended: success ? messages.length : 0,
        bytesWritten: success ? bytesWritten : 0,
      };
    }

    const success = appendManyToTranscriptJSONL(baseDir, sessionId, messages);
    return {
      success,
      appended: success ? messages.length : 0,
      bytesWritten: success ? bytesWritten : 0,
    };
  } catch (err) {
    logger.error('[TranscriptAppend] 批量追加失败:', sessionId, err);
    return {
      success: false,
      appended: 0,
      bytesWritten: 0,
      error: err as Error,
    };
  }
}

async function atomicAppend(
  baseDir: string,
  sessionId: string,
  line: string
): Promise<boolean> {
  const filePath = getSessionFilePath(baseDir, sessionId);
  const tempPath = getTempFilePath(filePath, sessionId);

  try {
    const dir = path.dirname(tempPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, tempPath);
    }

    const fd = fs.openSync(tempPath, 'a');
    try {
      fs.writeSync(fd, line + '\n');
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    logger.error('[TranscriptAppend] 原子追加失败:', sessionId, err);
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore
    }
    return false;
  }
}

async function atomicAppendMany(
  baseDir: string,
  sessionId: string,
  content: string
): Promise<boolean> {
  const filePath = getSessionFilePath(baseDir, sessionId);
  const tempPath = getTempFilePath(filePath, sessionId);

  try {
    const dir = path.dirname(tempPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(filePath)) {
      fs.copyFileSync(filePath, tempPath);
    }

    const fd = fs.openSync(tempPath, 'a');
    try {
      fs.writeSync(fd, content);
    } finally {
      fs.closeSync(fd);
    }

    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    logger.error('[TranscriptAppend] 批量原子追加失败:', sessionId, err);
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // ignore
    }
    return false;
  }
}

export function createAppendBuffer(
  baseDir: string,
  sessionId: string,
  options: {
    maxSize?: number;
    flushIntervalMs?: number;
    enableAtomic?: boolean;
  } = {}
): AppendBuffer {
  return new AppendBuffer(baseDir, sessionId, options);
}

export class AppendBuffer {
  private baseDir: string;
  private sessionId: string;
  private maxSize: number;
  private flushIntervalMs: number;
  private enableAtomic: boolean;
  private buffer: TranscriptMessage[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private isFlushing = false;

  constructor(
    baseDir: string,
    sessionId: string,
    options: {
      maxSize?: number;
      flushIntervalMs?: number;
      enableAtomic?: boolean;
    } = {}
  ) {
    this.baseDir = baseDir;
    this.sessionId = sessionId;
    this.maxSize = options.maxSize ?? 50;
    this.flushIntervalMs = options.flushIntervalMs ?? 2000;
    this.enableAtomic = options.enableAtomic ?? true;
  }

  append(message: TranscriptMessage): void {
    this.buffer.push(message);
    this.scheduleFlush();

    if (this.buffer.length >= this.maxSize) {
      this.flush();
    }
  }

  flush(): Promise<AppendResult> {
    if (this.isFlushing || this.buffer.length === 0) {
      return Promise.resolve({ success: true, appended: 0, bytesWritten: 0 });
    }

    this.isFlushing = true;
    const messages = [...this.buffer];
    this.buffer = [];

    return appendMessages(this.baseDir, this.sessionId, messages, this.enableAtomic)
      .then(result => {
        this.isFlushing = false;
        return result;
      })
      .catch(err => {
        this.isFlushing = false;
        logger.error('[AppendBuffer] 刷新失败:', this.sessionId, err);
        return { success: false, appended: 0, bytesWritten: 0, error: err as Error };
      });
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, this.flushIntervalMs);

    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  async close(): Promise<AppendResult> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    return this.flush();
  }

  getBufferSize(): number {
    return this.buffer.length;
  }
}
