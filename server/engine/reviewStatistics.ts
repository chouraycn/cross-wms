import { logger } from '../logger.js';
import type { OutputQuality, OutputReviewDecision } from './outputReviewer.js';

export interface ReviewStatisticsEntry {
  sessionId: string;
  timestamp: number;
  quality: OutputQuality;
  issues: string[];
  suggestion: string;
  model?: string;
  responseLength: number;
  questionLength: number;
}

export interface QualityTrendReport {
  totalReviews: number;
  qualityDistribution: Record<OutputQuality, number>;
  averageScore: number;
  passRate: number;
  topIssues: Array<{ issue: string; count: number }>;
  recentTrend: Array<{ timestamp: number; quality: OutputQuality; sessionId: string }>;
  sessionStats: Map<string, { total: number; passed: number; avgScore: number }>;
}

const QUALITY_SCORES: Record<OutputQuality, number> = { A: 4, B: 3, C: 2, D: 1 };
const PASS_THRESHOLD = 3; // B 及以上算通过

export class ReviewStatisticsManager {
  private entries: ReviewStatisticsEntry[] = [];
  private maxEntries: number = 5000;

  record(entry: ReviewStatisticsEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    logger.info(`[ReviewStats] Recorded: quality=${entry.quality}, session=${entry.sessionId}`);
  }

  getRecentEntries(limit: number = 50): ReviewStatisticsEntry[] {
    return this.entries.slice(-limit);
  }

  getEntriesBySession(sessionId: string): ReviewStatisticsEntry[] {
    return this.entries.filter((e) => e.sessionId === sessionId);
  }

  generateReport(): QualityTrendReport {
    const total = this.entries.length;
    const distribution: Record<OutputQuality, number> = { A: 0, B: 0, C: 0, D: 0 };
    const issueMap = new Map<string, number>();
    const sessionStats = new Map<string, { total: number; passed: number; avgScore: number }>();

    let totalScore = 0;
    let passedCount = 0;

    for (const entry of this.entries) {
      distribution[entry.quality]++;
      totalScore += QUALITY_SCORES[entry.quality];
      if (QUALITY_SCORES[entry.quality] >= PASS_THRESHOLD) {
        passedCount++;
      }

      for (const issue of entry.issues) {
        issueMap.set(issue, (issueMap.get(issue) || 0) + 1);
      }

      const sessionStat = sessionStats.get(entry.sessionId) || { total: 0, passed: 0, avgScore: 0 };
      sessionStat.total++;
      if (QUALITY_SCORES[entry.quality] >= PASS_THRESHOLD) {
        sessionStat.passed++;
      }
      sessionStats.set(entry.sessionId, sessionStat);
    }

    for (const [sessionId, stat] of sessionStats) {
      const sessionEntries = this.entries.filter((e) => e.sessionId === sessionId);
      const sessionScore = sessionEntries.reduce((sum, e) => sum + QUALITY_SCORES[e.quality], 0);
      stat.avgScore = sessionEntries.length > 0 ? sessionScore / sessionEntries.length : 0;
    }

    const topIssues = Array.from(issueMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([issue, count]) => ({ issue, count }));

    const recentTrend = this.entries
      .slice(-30)
      .map((e) => ({ timestamp: e.timestamp, quality: e.quality, sessionId: e.sessionId }));

    return {
      totalReviews: total,
      qualityDistribution: distribution,
      averageScore: total > 0 ? totalScore / total : 0,
      passRate: total > 0 ? passedCount / total : 0,
      topIssues,
      recentTrend,
      sessionStats,
    };
  }

  clear(): void {
    this.entries = [];
  }

  getSize(): number {
    return this.entries.length;
  }
}

export const reviewStatisticsManager = new ReviewStatisticsManager();
