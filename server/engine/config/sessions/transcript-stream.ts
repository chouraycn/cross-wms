import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { isValidSessionId } from './paths.js';
import { createWriteContext, shouldFlush, addToBuffer, clearBuffer, closeContext, formatMessageLine } from './transcript-write-context.js';
import type { TranscriptWriteContext, TranscriptWriteOptions } from './transcript-write-context.js';
import type { TranscriptMessage } from './types.js';

export class TranscriptStream {
  private context: TranscriptWriteContext;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    sessionId: string,
    filePath: string,
    options: TranscriptWriteOptions = {}
  ) {
    this.context = createWriteContext(sessionId, filePath, options);
  }

  open(): boolean {
    if (this.context.isOpen) return true;

    try {
      const dir = path.dirname(this.context.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (this.context.mode === 'overwrite' || !fs.existsSync(this.context.filePath)) {
        const headerLine = JSON.stringify({ header: this.context.header });
        fs.writeFileSync(this.context.filePath, headerLine + '\n', 'utf-8');
        this.context.bytesWritten = headerLine.length + 1;
      }

      this.context.isOpen = true;
      this.startAutoFlush();
      logger.debug('[TranscriptStream] 流已打开:', this.context.sessionId);
      return true;
    } catch (err) {
      logger.error('[TranscriptStream] 打开流失败:', this.context.sessionId, err);
      this.context.error = err as Error;
      return false;
    }
  }

  write(message: TranscriptMessage): boolean {
    if (!this.context.isOpen) return false;

    try {
      const line = formatMessageLine(message, this.context.format);
      addToBuffer(this.context, line);

      if (shouldFlush(this.context)) {
        this.flush();
      }

      return true;
    } catch (err) {
      logger.error('[TranscriptStream] 写入消息失败:', this.context.sessionId, err);
      this.context.error = err as Error;
      return false;
    }
  }

  writeRaw(line: string): boolean {
    if (!this.context.isOpen) return false;

    try {
      addToBuffer(this.context, line);
      if (shouldFlush(this.context)) {
        this.flush();
      }
      return true;
    } catch (err) {
      logger.error('[TranscriptStream] 写入原始数据失败:', this.context.sessionId, err);
      return false;
    }
  }

  flush(): boolean {
    if (!this.context.isOpen) return false;
    if (this.context.bufferSize === 0) return true;

    try {
      const lines = clearBuffer(this.context);
      const content = lines.join('\n') + '\n';

      const fd = fs.openSync(this.context.filePath, 'a');
      try {
        fs.writeSync(fd, content);
        this.context.bytesWritten += content.length;
      } finally {
        fs.closeSync(fd);
      }

      logger.debug('[TranscriptStream] 刷新缓冲区:', this.context.sessionId, lines.length, '条');
      return true;
    } catch (err) {
      logger.error('[TranscriptStream] 刷新失败:', this.context.sessionId, err);
      this.context.error = err as Error;
      return false;
    }
  }

  close(): boolean {
    if (!this.context.isOpen) return true;

    try {
      this.stopAutoFlush();
      this.flush();
      closeContext(this.context);
      logger.debug('[TranscriptStream] 流已关闭:', this.context.sessionId);
      return true;
    } catch (err) {
      logger.error('[TranscriptStream] 关闭流失败:', this.context.sessionId, err);
      return false;
    }
  }

  private startAutoFlush(): void {
    if (this.flushTimer) return;

    this.flushTimer = setInterval(() => {
      if (this.context.isOpen && this.context.bufferSize > 0) {
        this.flush();
      }
    }, this.context.flushIntervalMs);

    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  private stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  getStats(): {
    messageCount: number;
    bytesWritten: number;
    bufferSize: number;
    isOpen: boolean;
    durationMs: number;
  } {
    return {
      messageCount: this.context.messageCount,
      bytesWritten: this.context.bytesWritten,
      bufferSize: this.context.bufferSize,
      isOpen: this.context.isOpen,
      durationMs: Date.now() - this.context.startedAt,
    };
  }

  getError(): Error | undefined {
    return this.context.error;
  }

  getSessionId(): string {
    return this.context.sessionId;
  }
}

export function createTranscriptStream(
  sessionId: string,
  filePath: string,
  options?: TranscriptWriteOptions
): TranscriptStream {
  return new TranscriptStream(sessionId, filePath, options);
}
