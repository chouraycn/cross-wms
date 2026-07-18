import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { SessionStore } from '../store.js';
import { readTranscriptJSONL, writeTranscriptJSONL } from '../transcript-jsonl.js';

export interface CompactionOptions {
  minFileSizeBytes?: number;
  maxFileSizeBytes?: number;
  dryRun?: boolean;
}

export interface CompactionResult {
  compactedCount: number;
  skippedCount: number;
  spaceReclaimedBytes: number;
  errors: string[];
  dryRun: boolean;
}

export class SessionCompaction {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  compact(options: CompactionOptions = {}): CompactionResult {
    const opts = {
      minFileSizeBytes: 1024 * 1024,
      maxFileSizeBytes: 50 * 1024 * 1024,
      dryRun: false,
      ...options,
    };

    const result: CompactionResult = {
      compactedCount: 0,
      skippedCount: 0,
      spaceReclaimedBytes: 0,
      errors: [],
      dryRun: opts.dryRun,
    };

    logger.info('[SessionCompaction] 开始压缩...');

    try {
      this.compactActiveSessions(result, opts);
      this.compactArchivedSessions(result, opts);
    } catch (err) {
      result.errors.push(`压缩异常: ${String(err)}`);
      logger.error('[SessionCompaction] 压缩异常:', err);
    }

    logger.info(
      `[SessionCompaction] 压缩完成: ${result.compactedCount} 个压缩, ` +
      `节省 ${(result.spaceReclaimedBytes / 1024 / 1024).toFixed(2)}MB`
    );

    return result;
  }

  private compactActiveSessions(result: CompactionResult, opts: CompactionOptions): void {
    const paths = this.store.getPaths();
    this.compactDirectory(paths.baseDir, false, result, opts);
  }

  private compactArchivedSessions(result: CompactionResult, opts: CompactionOptions): void {
    const paths = this.store.getPaths();
    this.compactDirectory(paths.archivedDir, true, result, opts);
  }

  private compactDirectory(
    dir: string,
    isArchived: boolean,
    result: CompactionResult,
    opts: CompactionOptions
  ): void {
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));

    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      const filePath = path.join(dir, file);

      try {
        const stats = fs.statSync(filePath);
        const fileSize = stats.size;

        if (fileSize < (opts.minFileSizeBytes || 1024 * 1024)) {
          result.skippedCount++;
          continue;
        }

        const originalSize = fileSize;

        const compacted = this.compactFile(filePath);

        if (compacted.length < originalSize) {
          if (!result.dryRun) {
            fs.writeFileSync(filePath, compacted, 'utf-8');
          }
          result.compactedCount++;
          result.spaceReclaimedBytes += originalSize - compacted.length;
          logger.debug('[SessionCompaction] 压缩:', sessionId, `${originalSize} -> ${compacted.length}`);
        } else {
          result.skippedCount++;
        }
      } catch (err) {
        result.errors.push(`${sessionId}: ${String(err)}`);
        logger.error('[SessionCompaction] 压缩失败:', sessionId, err);
      }
    }
  }

  private compactFile(filePath: string): string {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    if (lines.length === 0) {
      return '';
    }

    const compactedLines = lines.map(line => {
      try {
        const parsed = JSON.parse(line);
        return JSON.stringify(parsed);
      } catch {
        return line;
      }
    });

    return compactedLines.join('\n') + '\n';
  }

  defragment(sessionId: string, isArchived: boolean = false): boolean {
    const paths = this.store.getPaths();
    const baseDir = isArchived ? paths.archivedDir : paths.baseDir;
    const filePath = path.join(baseDir, `${sessionId}.jsonl`);

    if (!fs.existsSync(filePath)) {
      logger.warn('[SessionCompaction] 文件不存在:', sessionId);
      return false;
    }

    try {
      const transcript = readTranscriptJSONL(baseDir, sessionId, isArchived);
      writeTranscriptJSONL(baseDir, sessionId, transcript.messages);

      logger.info('[SessionCompaction] 碎片整理完成:', sessionId);
      return true;
    } catch (err) {
      logger.error('[SessionCompaction] 碎片整理失败:', sessionId, err);
      return false;
    }
  }
}