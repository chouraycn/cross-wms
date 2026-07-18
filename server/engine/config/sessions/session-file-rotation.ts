import fs from 'fs';
import path from 'path';
import { logger } from '../../../logger.js';
import { getSessionFilePath, getTempFilePath } from './paths.js';
import { isValidSessionId } from './paths.js';

export interface RotationConfig {
  maxFileSizeBytes: number;
  maxFileCount: number;
  compressionEnabled: boolean;
  rotationStrategy: 'size' | 'time' | 'size_and_time';
  rotationIntervalMs?: number;
}

export const defaultRotationConfig: RotationConfig = {
  maxFileSizeBytes: 50 * 1024 * 1024,
  maxFileCount: 10,
  compressionEnabled: false,
  rotationStrategy: 'size',
};

export interface RotationResult {
  rotated: boolean;
  newFilePath?: string;
  archivePath?: string;
  error?: Error;
}

export function needsRotation(
  baseDir: string,
  sessionId: string,
  config: RotationConfig = defaultRotationConfig
): boolean {
  if (!isValidSessionId(sessionId)) return false;

  const filePath = getSessionFilePath(baseDir, sessionId);
  try {
    if (!fs.existsSync(filePath)) return false;
    const stats = fs.statSync(filePath);
    return stats.size >= config.maxFileSizeBytes;
  } catch {
    return false;
  }
}

export function rotateSessionFile(
  baseDir: string,
  sessionId: string,
  config: RotationConfig = defaultRotationConfig
): RotationResult {
  if (!isValidSessionId(sessionId)) {
    return { rotated: false, error: new Error('Invalid session ID') };
  }

  const filePath = getSessionFilePath(baseDir, sessionId);

  try {
    if (!fs.existsSync(filePath)) {
      return { rotated: false, error: new Error('Session file not found') };
    }

    const stats = fs.statSync(filePath);
    if (stats.size < config.maxFileSizeBytes) {
      return { rotated: false };
    }

    const rotationDir = path.join(baseDir, 'rotated', sessionId);
    if (!fs.existsSync(rotationDir)) {
      fs.mkdirSync(rotationDir, { recursive: true });
    }

    const timestamp = Date.now();
    const archiveFileName = `${sessionId}.${timestamp}.jsonl`;
    const archivePath = path.join(rotationDir, archiveFileName);

    fs.renameSync(filePath, archivePath);

    cleanupOldRotations(rotationDir, config.maxFileCount);

    logger.info('[SessionRotation] 会话文件已轮换:', sessionId, {
      originalSize: stats.size,
      archivePath,
    });

    return {
      rotated: true,
      newFilePath: filePath,
      archivePath,
    };
  } catch (err) {
    logger.error('[SessionRotation] 轮换失败:', sessionId, err);
    return { rotated: false, error: err as Error };
  }
}

export function cleanupOldRotations(rotationDir: string, maxFiles: number): void {
  try {
    if (!fs.existsSync(rotationDir)) return;

    const files = fs.readdirSync(rotationDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const filePath = path.join(rotationDir, f);
        const stats = fs.statSync(filePath);
        return { name: f, path: filePath, mtime: stats.mtimeMs };
      })
      .sort((a, b) => a.mtime - b.mtime);

    while (files.length > maxFiles) {
      const oldest = files.shift();
      if (oldest) {
        try {
          fs.unlinkSync(oldest.path);
          logger.debug('[SessionRotation] 清理旧轮换文件:', oldest.name);
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    logger.error('[SessionRotation] 清理旧轮换文件失败:', err);
  }
}

export function getRotatedFiles(
  baseDir: string,
  sessionId: string
): Array<{ path: string; size: number; modifiedAt: Date }> {
  const rotationDir = path.join(baseDir, 'rotated', sessionId);
  try {
    if (!fs.existsSync(rotationDir)) return [];

    return fs.readdirSync(rotationDir)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => {
        const filePath = path.join(rotationDir, f);
        const stats = fs.statSync(filePath);
        return {
          path: filePath,
          size: stats.size,
          modifiedAt: stats.mtime,
        };
      })
      .sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  } catch {
    return [];
  }
}

export function mergeRotatedFiles(
  baseDir: string,
  sessionId: string,
  outputPath?: string
): Promise<string | null> {
  if (!isValidSessionId(sessionId)) return Promise.resolve(null);

  const filePath = outputPath || getSessionFilePath(baseDir, sessionId);
  const rotatedFiles = getRotatedFiles(baseDir, sessionId);

  if (rotatedFiles.length === 0) return Promise.resolve(filePath);

  try {
    const tempPath = getTempFilePath(filePath, sessionId);
    const tempDir = path.dirname(tempPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(tempPath);

    for (const file of rotatedFiles.reverse()) {
      const content = fs.readFileSync(file.path, 'utf-8');
      writeStream.write(content);
      if (!content.endsWith('\n')) {
        writeStream.write('\n');
      }
    }

    const currentFilePath = getSessionFilePath(baseDir, sessionId);
    if (fs.existsSync(currentFilePath)) {
      const currentContent = fs.readFileSync(currentFilePath, 'utf-8');
      writeStream.write(currentContent);
    }

    writeStream.end();

    return new Promise<string | null>((resolve) => {
      writeStream.on('finish', () => {
        try {
          fs.renameSync(tempPath, filePath);
          resolve(filePath);
        } catch (err) {
          logger.error('[SessionRotation] 合并文件重命名失败:', err);
          resolve(null);
        }
      });
      writeStream.on('error', (err) => {
        logger.error('[SessionRotation] 合并文件失败:', err);
        resolve(null);
      });
    });
  } catch (err) {
    logger.error('[SessionRotation] 合并轮换文件失败:', err);
    return Promise.resolve(null);
  }
}
