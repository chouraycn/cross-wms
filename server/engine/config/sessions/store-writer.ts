import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { getTempFilePath, getSessionFilePath, isValidSessionId } from './paths.js';
import type { StoreWriteResult } from './types.js';

export class SessionStoreWriter {
  private baseDir: string;
  private enableAtomicWrites: boolean;
  private enableFileLocking: boolean;

  constructor(
    baseDir: string,
    options: {
      enableAtomicWrites?: boolean;
      enableFileLocking?: boolean;
    } = {}
  ) {
    this.baseDir = baseDir;
    this.enableAtomicWrites = options.enableAtomicWrites ?? true;
    this.enableFileLocking = options.enableFileLocking ?? true;
  }

  async writeSessionFile(
    sessionId: string,
    content: string
  ): Promise<StoreWriteResult> {
    const startTime = Date.now();

    if (!isValidSessionId(sessionId)) {
      return {
        success: false,
        error: new Error('Invalid session ID'),
        durationMs: Date.now() - startTime,
      };
    }

    const filePath = getSessionFilePath(this.baseDir, sessionId);

    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (this.enableAtomicWrites) {
        await this.atomicWrite(filePath, content, sessionId);
      } else {
        fs.writeFileSync(filePath, content, 'utf-8');
      }

      return {
        success: true,
        path: filePath,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      logger.error('[StoreWriter] 写入会话文件失败:', sessionId, err);
      return {
        success: false,
        error: err as Error,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async appendToSessionFile(
    sessionId: string,
    line: string
  ): Promise<StoreWriteResult> {
    const startTime = Date.now();

    if (!isValidSessionId(sessionId)) {
      return {
        success: false,
        error: new Error('Invalid session ID'),
        durationMs: Date.now() - startTime,
      };
    }

    const filePath = getSessionFilePath(this.baseDir, sessionId);

    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const fd = fs.openSync(filePath, 'a');
      try {
        fs.writeSync(fd, line + '\n');
      } finally {
        fs.closeSync(fd);
      }

      return {
        success: true,
        path: filePath,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      logger.error('[StoreWriter] 追加写入失败:', sessionId, err);
      return {
        success: false,
        error: err as Error,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async rewriteFirstLine(
    sessionId: string,
    newFirstLine: string
  ): Promise<StoreWriteResult> {
    const startTime = Date.now();

    if (!isValidSessionId(sessionId)) {
      return {
        success: false,
        error: new Error('Invalid session ID'),
        durationMs: Date.now() - startTime,
      };
    }

    const filePath = getSessionFilePath(this.baseDir, sessionId);

    try {
      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          error: new Error('Session file not found'),
          durationMs: Date.now() - startTime,
        };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const newlineIndex = content.indexOf('\n');
      let newContent: string;

      if (newlineIndex >= 0) {
        newContent = newFirstLine + content.slice(newlineIndex);
      } else {
        newContent = newFirstLine + '\n';
      }

      if (this.enableAtomicWrites) {
        await this.atomicWrite(filePath, newContent, sessionId);
      } else {
        fs.writeFileSync(filePath, newContent, 'utf-8');
      }

      return {
        success: true,
        path: filePath,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      logger.error('[StoreWriter] 重写首行失败:', sessionId, err);
      return {
        success: false,
        error: err as Error,
        durationMs: Date.now() - startTime,
      };
    }
  }

  async deleteSessionFile(sessionId: string): Promise<StoreWriteResult> {
    const startTime = Date.now();

    if (!isValidSessionId(sessionId)) {
      return {
        success: false,
        error: new Error('Invalid session ID'),
        durationMs: Date.now() - startTime,
      };
    }

    const filePath = getSessionFilePath(this.baseDir, sessionId);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return {
        success: true,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      logger.error('[StoreWriter] 删除会话文件失败:', sessionId, err);
      return {
        success: false,
        error: err as Error,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private async atomicWrite(
    filePath: string,
    content: string,
    sessionId: string
  ): Promise<void> {
    const tempPath = getTempFilePath(filePath, sessionId);
    const tempDir = path.dirname(tempPath);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    try {
      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, filePath);
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // ignore
      }
      throw err;
    }
  }

  async writeJsonFile(
    relativePath: string,
    data: unknown
  ): Promise<StoreWriteResult> {
    const startTime = Date.now();
    const filePath = path.join(this.baseDir, relativePath);

    try {
      const content = JSON.stringify(data, null, 2);
      const dir = path.dirname(filePath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (this.enableAtomicWrites) {
        const tempPath = getTempFilePath(filePath);
        const tempDir = path.dirname(tempPath);

        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        try {
          fs.writeFileSync(tempPath, content, 'utf-8');
          fs.renameSync(tempPath, filePath);
        } catch (err) {
          try {
            if (fs.existsSync(tempPath)) {
              fs.unlinkSync(tempPath);
            }
          } catch {
            // ignore
          }
          throw err;
        }
      } else {
        fs.writeFileSync(filePath, content, 'utf-8');
      }

      return {
        success: true,
        path: filePath,
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      logger.error('[StoreWriter] 写入 JSON 文件失败:', relativePath, err);
      return {
        success: false,
        error: err as Error,
        durationMs: Date.now() - startTime,
      };
    }
  }

  readJsonFile<T = unknown>(relativePath: string): T | null {
    const filePath = path.join(this.baseDir, relativePath);

    try {
      if (!fs.existsSync(filePath)) return null;
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    } catch (err) {
      logger.error('[StoreWriter] 读取 JSON 文件失败:', relativePath, err);
      return null;
    }
  }
}
