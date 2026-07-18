import fs from 'fs';
import path from 'path';
import { logger } from '../../../../logger.js';
import type { ReconciliationStats } from './reconciliation-types.js';

const STATS_FILE = '.reconciliation-stats.json';

export class ReconciliationStatsManager {
  private stats: ReconciliationStats;
  private statsPath: string;

  constructor(baseDir: string) {
    this.statsPath = path.join(baseDir, STATS_FILE);
    this.stats = this.loadStats();
  }

  private loadStats(): ReconciliationStats {
    try {
      if (fs.existsSync(this.statsPath)) {
        const content = fs.readFileSync(this.statsPath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (err) {
      logger.warn('[ReconciliationStats] 加载统计失败:', err);
    }

    return this.getEmptyStats();
  }

  private getEmptyStats(): ReconciliationStats {
    return {
      totalSessions: 0,
      consistentSessions: 0,
      inconsistentSessions: 0,
      missingFiles: 0,
      missingMetadata: 0,
      corruptedFiles: 0,
      duplicateEntries: 0,
      statusMismatches: 0,
      lastRun: null,
      runCount: 0,
    };
  }

  update(stats: Partial<ReconciliationStats>): void {
    this.stats = { ...this.stats, ...stats };
    this.save();
  }

  incrementRunCount(): void {
    this.stats.runCount++;
    this.stats.lastRun = new Date().toISOString();
    this.save();
  }

  getStats(): ReconciliationStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = this.getEmptyStats();
    this.save();
  }

  private save(): void {
    try {
      const dir = path.dirname(this.statsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.statsPath, JSON.stringify(this.stats, null, 2), 'utf-8');
    } catch (err) {
      logger.warn('[ReconciliationStats] 保存统计失败:', err);
    }
  }
}