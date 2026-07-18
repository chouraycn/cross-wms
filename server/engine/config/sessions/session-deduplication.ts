import { logger } from '../../../logger.js';
import { SessionStore } from './store.js';
import type { SessionMetadata, TranscriptMessage } from './types.js';

export interface DeduplicationOptions {
  minSimilarity?: number;
  compareTitle?: boolean;
  compareContent?: boolean;
  compareTimestamp?: boolean;
  timeWindowMs?: number;
  dryRun?: boolean;
}

export interface DeduplicationResult {
  totalChecked: number;
  duplicatesFound: number;
  duplicatesRemoved: number;
  errors: string[];
  dryRun: boolean;
}

export interface DuplicatePair {
  sessionId1: string;
  sessionId2: string;
  similarity: number;
  reason: string;
}

export class SessionDeduplication {
  private store: SessionStore;

  constructor(store: SessionStore) {
    this.store = store;
  }

  async deduplicate(options: DeduplicationOptions = {}): Promise<DeduplicationResult> {
    const opts = {
      minSimilarity: 0.9,
      compareTitle: true,
      compareContent: true,
      compareTimestamp: true,
      timeWindowMs: 60 * 60 * 1000,
      dryRun: false,
      ...options,
    };

    const result: DeduplicationResult = {
      totalChecked: 0,
      duplicatesFound: 0,
      duplicatesRemoved: 0,
      errors: [],
      dryRun: opts.dryRun,
    };

    logger.info('[SessionDeduplication] 开始去重...');

    try {
      const sessions = this.store.listSessions().sessions;
      result.totalChecked = sessions.length;

      const duplicates = await this.findDuplicates(sessions, opts);
      result.duplicatesFound = duplicates.length;

      for (const duplicate of duplicates) {
        try {
          if (!opts.dryRun) {
            const removed = await this.removeDuplicate(duplicate);
            if (removed) {
              result.duplicatesRemoved++;
              logger.info(`[SessionDeduplication] 移除重复: ${duplicate.sessionId2}`);
            }
          } else {
            result.duplicatesRemoved++;
            logger.info(`[SessionDeduplication] 模拟移除重复: ${duplicate.sessionId2}`);
          }
        } catch (err) {
          result.errors.push(`${duplicate.sessionId2}: ${String(err)}`);
          logger.error('[SessionDeduplication] 移除重复失败:', duplicate.sessionId2, err);
        }
      }

      logger.info(
        `[SessionDeduplication] 去重完成: ${result.totalChecked} 个检查, ` +
        `${result.duplicatesFound} 个重复, ${result.duplicatesRemoved} 个移除`
      );
    } catch (err) {
      result.errors.push(`去重异常: ${String(err)}`);
      logger.error('[SessionDeduplication] 去重异常:', err);
    }

    return result;
  }

  private async findDuplicates(
    sessions: SessionMetadata[],
    opts: DeduplicationOptions
  ): Promise<DuplicatePair[]> {
    const duplicates: DuplicatePair[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const s1 = sessions[i];
        const s2 = sessions[j];

        if (seen.has(s1.id) || seen.has(s2.id)) continue;

        const similarity = await this.calculateSimilarity(s1, s2, opts);

        if (similarity >= (opts.minSimilarity || 0.9)) {
          duplicates.push({
            sessionId1: s1.id,
            sessionId2: s2.id,
            similarity,
            reason: this.getDuplicateReason(s1, s2, opts),
          });
          seen.add(s2.id);
        }
      }
    }

    return duplicates;
  }

  private async calculateSimilarity(
    s1: SessionMetadata,
    s2: SessionMetadata,
    opts: DeduplicationOptions
  ): Promise<number> {
    let score = 0;
    let total = 0;

    if (opts.compareTitle) {
      total++;
      if (s1.title === s2.title) {
        score++;
      } else {
        score += this.stringSimilarity(s1.title || '', s2.title || '');
      }
    }

    if (opts.compareTimestamp) {
      total++;
      const ts1 = new Date(s1.createdAt).getTime();
      const ts2 = new Date(s2.createdAt).getTime();
      const diff = Math.abs(ts1 - ts2);
      if (diff <= (opts.timeWindowMs || 60 * 60 * 1000)) {
        score += Math.max(0, 1 - diff / (opts.timeWindowMs || 60 * 60 * 1000));
      }
    }

    if (opts.compareContent) {
      total++;
      const messages1 = this.store.getMessages(s1.id);
      const messages2 = this.store.getMessages(s2.id);
      score += this.messagesSimilarity(messages1, messages2);
    }

    return total > 0 ? score / total : 0;
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    const longerLength = longer.length;

    if (longerLength === 0) return 1;

    return (longerLength - this.editDistance(longer, shorter)) / longerLength;
  }

  private editDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  private messagesSimilarity(m1: TranscriptMessage[], m2: TranscriptMessage[]): number {
    if (m1.length === 0 && m2.length === 0) return 1;
    if (m1.length === 0 || m2.length === 0) return 0;

    let matchCount = 0;
    const total = Math.max(m1.length, m2.length);

    for (const msg1 of m1) {
      for (const msg2 of m2) {
        if (msg1.content === msg2.content && msg1.role === msg2.role) {
          matchCount++;
          break;
        }
      }
    }

    return matchCount / total;
  }

  private getDuplicateReason(
    s1: SessionMetadata,
    s2: SessionMetadata,
    opts: DeduplicationOptions
  ): string {
    const reasons: string[] = [];

    if (opts.compareTitle && s1.title === s2.title) {
      reasons.push('标题相同');
    }

    if (opts.compareTimestamp) {
      const diff = Math.abs(new Date(s1.createdAt).getTime() - new Date(s2.createdAt).getTime());
      if (diff <= (opts.timeWindowMs || 60 * 60 * 1000)) {
        reasons.push('时间相近');
      }
    }

    if (opts.compareContent) {
      const messages1 = this.store.getMessages(s1.id);
      const messages2 = this.store.getMessages(s2.id);
      if (messages1.length > 0 && messages1.length === messages2.length) {
        reasons.push('消息数相同');
      }
    }

    return reasons.join(', ') || '相似度高';
  }

  private async removeDuplicate(duplicate: DuplicatePair): Promise<boolean> {
    try {
      const s1 = this.store.getMetadata(duplicate.sessionId1);
      const s2 = this.store.getMetadata(duplicate.sessionId2);

      const toDelete = this.selectToDelete(s1, s2);
      if (!toDelete) return false;

      await this.store.deleteSession(toDelete, true);
      return true;
    } catch (err) {
      logger.error('[SessionDeduplication] 删除重复会话失败:', duplicate.sessionId2, err);
      return false;
    }
  }

  private selectToDelete(s1: SessionMetadata | null, s2: SessionMetadata | null): string | null {
    if (!s1 || !s2) return null;

    const ts1 = new Date(s1.createdAt).getTime();
    const ts2 = new Date(s2.createdAt).getTime();

    if (ts1 < ts2) {
      return s1.id;
    }

    return s2.id;
  }
}