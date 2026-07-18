import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import { SessionStore } from '../store.js';
import type { SessionMetadata, TranscriptMessage } from '../types.js';
import type { BackfillSource, BackfillOptions, BackfillResult, BackfillStats } from './backfill-types.js';

export class BackfillEngine {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  async backfill(options: BackfillOptions): Promise<BackfillResult> {
    const opts = {
      dryRun: false,
      batchSize: 100,
      skipExisting: true,
      validateData: true,
      ...options,
    };

    const result: BackfillResult = {
      success: true,
      totalProcessed: 0,
      totalCreated: 0,
      totalUpdated: 0,
      totalSkipped: 0,
      totalFailed: 0,
      errors: [],
      dryRun: opts.dryRun,
    };

    logger.info('[BackfillEngine] 开始数据回填...');

    try {
      const data = await this.loadSourceData(opts.source);

      for (let i = 0; i < data.length; i += opts.batchSize) {
        const batch = data.slice(i, i + opts.batchSize);

        for (const item of batch) {
          try {
            const processed = await this.processItem(item, opts);
            result.totalProcessed++;

            if (processed.created) result.totalCreated++;
            else if (processed.updated) result.totalUpdated++;
            else if (processed.skipped) result.totalSkipped++;
          } catch (err) {
            result.totalFailed++;
            result.errors.push(`${result.totalProcessed}: ${String(err)}`);
            logger.error('[BackfillEngine] 处理失败:', result.totalProcessed, err);
          }
        }

        if ((i + opts.batchSize) % (opts.batchSize * 10) === 0) {
          logger.info(
            `[BackfillEngine] 进度: ${result.totalProcessed}/${data.length}, ` +
            `创建: ${result.totalCreated}, 更新: ${result.totalUpdated}`
          );
        }
      }

      logger.info(
        `[BackfillEngine] 回填完成: ${result.totalProcessed} 个处理, ` +
        `${result.totalCreated} 个创建, ${result.totalUpdated} 个更新, ${result.totalFailed} 个失败`
      );
    } catch (err) {
      result.success = false;
      result.errors.push(`回填异常: ${String(err)}`);
      logger.error('[BackfillEngine] 回填异常:', err);
    }

    return result;
  }

  async getStats(source: BackfillSource): Promise<BackfillStats> {
    const stats: BackfillStats = {
      totalSessions: 0,
      messagesPerSession: 0,
      avgMessageSizeBytes: 0,
      totalSizeBytes: 0,
      durationMs: 0,
    };

    try {
      const data = await this.loadSourceData(source);
      stats.totalSessions = data.length;

      let totalMessages = 0;
      let totalSize = 0;

      for (const item of data) {
        const messages = (item as any).messages || [];
        totalMessages += messages.length;

        for (const msg of messages) {
          totalSize += Buffer.byteLength(JSON.stringify(msg), 'utf-8');
        }
      }

      stats.messagesPerSession = stats.totalSessions > 0 ? Math.round(totalMessages / stats.totalSessions) : 0;
      stats.avgMessageSizeBytes = totalMessages > 0 ? Math.round(totalSize / totalMessages) : 0;
      stats.totalSizeBytes = totalSize;
    } catch (err) {
      logger.error('[BackfillEngine] 获取统计失败:', err);
    }

    return stats;
  }

  private async loadSourceData(source: BackfillSource): Promise<unknown[]> {
    switch (source.type) {
      case 'file':
        return this.loadFromFile(source.path!);
      case 'json':
        return source.data || [];
      case 'database':
        return this.loadFromDatabase(source.connectionString!);
      case 'api':
        return this.loadFromApi(source.url!);
      default:
        return [];
    }
  }

  private async loadFromFile(filePath: string): Promise<unknown[]> {
    logger.info('[BackfillEngine] 从文件加载数据:', filePath);

    if (!fs.existsSync(filePath)) {
      throw new Error(`文件不存在: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.json') {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } else if (ext === '.jsonl') {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      return lines.map(line => JSON.parse(line));
    } else {
      throw new Error(`不支持的文件格式: ${ext}`);
    }
  }

  private async loadFromDatabase(_connectionString: string): Promise<unknown[]> {
    logger.warn('[BackfillEngine] 数据库数据源尚未实现');
    return [];
  }

  private async loadFromApi(_url: string): Promise<unknown[]> {
    logger.warn('[BackfillEngine] API 数据源尚未实现');
    return [];
  }

  private async processItem(
    item: unknown,
    opts: BackfillOptions
  ): Promise<{ created: boolean; updated: boolean; skipped: boolean }> {
    const data = item as { id?: string; metadata?: Partial<SessionMetadata>; messages?: TranscriptMessage[] };

    if (!data.id && !data.metadata?.id) {
      throw new Error('会话缺少 ID');
    }

    const sessionId = data.id || data.metadata!.id!;

    if (opts.skipExisting) {
      const existing = this.store.getMetadata(sessionId);
      if (existing) {
        return { created: false, updated: false, skipped: true };
      }
    }

    if (opts.validateData) {
      const validation = this.validateSessionData(data);
      if (!validation.valid) {
        throw new Error(`数据验证失败: ${validation.errors.join(', ')}`);
      }
    }

    if (!opts.dryRun) {
      const now = new Date().toISOString();
      const metadata: Partial<SessionMetadata> = {
        id: sessionId,
        title: data.metadata?.title || '未命名会话',
        model: data.metadata?.model || 'auto',
        status: data.metadata?.status || 'active',
        createdAt: data.metadata?.createdAt || now,
        updatedAt: data.metadata?.updatedAt || now,
        lastActiveAt: data.metadata?.lastActiveAt || now,
        sessionDate: data.metadata?.sessionDate || now.split('T')[0],
        tags: data.metadata?.tags || [],
        messageCount: data.messages?.length || 0,
        schemaVersion: '1.0.0',
        ...data.metadata,
      };

      const created = this.store.createSession(metadata);

      if (data.messages && data.messages.length > 0) {
        for (const msg of data.messages) {
          await this.store.appendMessage(sessionId, msg);
        }
      }

      return { created: true, updated: false, skipped: false };
    }

    return { created: true, updated: false, skipped: false };
  }

  private validateSessionData(data: {
    id?: string;
    metadata?: Partial<SessionMetadata>;
    messages?: TranscriptMessage[];
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.id && !data.metadata?.id) {
      errors.push('缺少会话 ID');
    }

    if (data.messages) {
      for (const msg of data.messages) {
        if (!msg.role) {
          errors.push('消息缺少 role');
        }
        if (!msg.content) {
          errors.push('消息缺少 content');
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }
}