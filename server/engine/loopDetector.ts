/**
 * LoopDetector — 死循环检测模块
 *
 * 通过 Jaccard 相似度 + 错误类型匹配检测 ReAct 循环中的死循环。
 * 连续 3 轮相似度 > 0.8 触发升级策略。
 *
 * 升级顺序：switch_tool → replan → ask_user
 *
 * v5.0.0: ReAct 循环优化
 */

import type { Observation } from './observer.js';

// ===================== 类型定义 =====================

/** 观察历史记录 */
export interface ObservationHistory {
  turnIndex: number;
  errorType: string;
  resultDigest: string;
}

/** 死循环检测结果 */
export interface LoopDetectionResult {
  isLoop: boolean;
  similarity: number; // Jaccard 相似度 0~1
  consecutiveCount: number;
  errorType: string;
}

/** 升级行动类型 */
export type EscalationAction = 'switch_tool' | 'replan' | 'ask_user';

/** 升级策略 */
export interface EscalationStrategy {
  action: EscalationAction;
  reason: string;
  alternativeToolName?: string;
}

// ===================== 常量 =====================

/** Jaccard 相似度阈值 */
const SIMILARITY_THRESHOLD = 0.8;

/** 连续相似轮数触发阈值 */
const CONSECUTIVE_THRESHOLD = 3;

/** 最大历史记录条数 */
const MAX_HISTORY_SIZE = 20;

// ===================== LoopDetector 类 =====================

/**
 * 死循环检测器 — 通过 Jaccard 相似度和错误类型匹配检测循环。
 *
 * 检测策略（混合策略）：
 * 1. Jaccard 粗筛：计算连续轮次结果文本的 Jaccard 相似度
 * 2. 错误类型匹配：提取错误分类后比较，匹配时相似度加权
 * 3. 连续 3 轮相似度 > 0.8 触发升级
 */
export class LoopDetector {
  private history: ObservationHistory[] = [];
  private threshold: number;
  private consecutiveThreshold: number;
  private consecutiveSimilarCount: number = 0;
  private lastSimilarity: number = 0;
  private escalationLevel: number = 0;

  constructor(threshold?: number, consecutiveThreshold?: number) {
    this.threshold = threshold ?? SIMILARITY_THRESHOLD;
    this.consecutiveThreshold = consecutiveThreshold ?? CONSECUTIVE_THRESHOLD;
  }

  /**
   * 检测当前轮次是否存在死循环。
   *
   * @param observations - 当前轮的观察结果列表
   * @param turnIndex - 当前轮次索引
   * @returns 死循环检测结果
   */
  detectLoop(observations: Observation[], turnIndex: number): LoopDetectionResult {
    // 提取当前轮的标准化摘要
    const currentDigest = this.normalizeResult(observations);
    const currentErrorType = this.extractErrorType(observations);

    // 与上一轮比较
    if (this.history.length > 0) {
      const lastEntry = this.history[this.history.length - 1];
      const similarity = this.calculateJaccard(lastEntry.resultDigest, currentDigest);

      // 错误类型也匹配时，相似度加权
      let weightedSimilarity = similarity;
      if (lastEntry.errorType === currentErrorType && currentErrorType !== 'none') {
        weightedSimilarity = Math.min(1, similarity + 0.1);
      }

      if (weightedSimilarity > this.threshold) {
        this.consecutiveSimilarCount += 1;
      } else {
        this.consecutiveSimilarCount = 0;
      }
      this.lastSimilarity = weightedSimilarity;
    }

    // 记录历史
    const historyEntry: ObservationHistory = {
      turnIndex,
      errorType: currentErrorType,
      resultDigest: currentDigest,
    };
    this.history.push(historyEntry);

    // 保持历史记录不超过上限
    if (this.history.length > MAX_HISTORY_SIZE) {
      this.history.shift();
    }

    // 判断是否触发死循环
    const isLoop = this.consecutiveSimilarCount >= this.consecutiveThreshold;

    return {
      isLoop,
      similarity: this.lastSimilarity,
      consecutiveCount: this.consecutiveSimilarCount,
      errorType: currentErrorType,
    };
  }

  /**
   * 获取升级策略。
   * 根据当前升级级别返回对应的行动。
   *
   * 升级顺序：switch_tool → replan → ask_user
   *
   * @param result - 死循环检测结果
   * @returns 升级策略
   */
  getEscalationStrategy(result: LoopDetectionResult): EscalationStrategy {
    if (!result.isLoop) {
      return {
        action: 'switch_tool',
        reason: '未检测到死循环',
      };
    }

    // 根据升级级别选择行动
    const level = this.escalationLevel % 3;
    this.escalationLevel += 1;

    switch (level) {
      case 0:
        return {
          action: 'switch_tool',
          reason: `连续 ${result.consecutiveCount} 轮检测到相似结果（相似度: ${result.similarity.toFixed(2)}），建议切换工具`,
          alternativeToolName: this.suggestAlternativeTool(result.errorType),
        };
      case 1:
        return {
          action: 'replan',
          reason: '切换工具后仍检测到死循环，触发重规划',
        };
      case 2:
        return {
          action: 'ask_user',
          reason: '重规划后仍无法突破死循环，请求用户澄清',
        };
      default:
        return {
          action: 'ask_user',
          reason: '多次升级后仍无法解决，请求用户介入',
        };
    }
  }

  /**
   * 计算两个文本的 Jaccard 相似度。
   * 将文本分词后计算交集/并集比例。
   *
   * @param a - 文本 A
   * @param b - 文本 B
   * @returns Jaccard 相似度 0~1
   */
  private calculateJaccard(a: string, b: string): number {
    const setA = new Set(this.tokenize(a));
    const setB = new Set(this.tokenize(b));

    if (setA.size === 0 && setB.size === 0) {
      return 1;
    }

    let intersection = 0;
    for (const token of setA) {
      if (setB.has(token)) {
        intersection += 1;
      }
    }

    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }

  /**
   * 文本分词。
   * 中文按字符分词，英文按空格分词。
   */
  private tokenize(text: string): string[] {
    // 移除空白和标点
    const cleaned = text.replace(/[\s\n\r\t,.;:!?()[\]{}"'`]/g, ' ');
    const tokens: string[] = [];

    // 检测是否包含 CJK 字符
    const hasCJK = /[\u4e00-\u9fff]/.test(cleaned);

    if (hasCJK) {
      // CJK 文本按字符分词
      for (const char of cleaned) {
        if (/[\u4e00-\u9fff]/.test(char)) {
          tokens.push(char);
        }
      }
      // 也按空格分词处理混合文本中的英文部分
      const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
      for (const part of parts) {
        if (!/[\u4e00-\u9fff]/.test(part) && part.length > 0) {
          tokens.push(part.toLowerCase());
        }
      }
    } else {
      // 纯英文/数字按空格分词
      const parts = cleaned.split(/\s+/).filter(p => p.length > 0);
      for (const part of parts) {
        tokens.push(part.toLowerCase());
      }
    }

    return tokens;
  }

  /**
   * 标准化观察结果为摘要文本。
   */
  private normalizeResult(observations: Observation[]): string {
    return observations
      .map(o => {
        const toolName = o.toolCall.name;
        const level = o.assessment.level;
        const resultPreview = o.result.slice(0, 200);
        return `${toolName}:${level}:${resultPreview}`;
      })
      .join('|');
  }

  /**
   * 从观察结果中提取错误类型。
   */
  private extractErrorType(observations: Observation[]): string {
    for (const obs of observations) {
      if (obs.assessment.level === 'error' || obs.assessment.level === 'warning') {
        // 尝试从结果中提取错误类型
        if (obs.result.includes('timeout') || obs.result.includes('ETIMEDOUT')) {
          return 'network_timeout';
        }
        if (obs.result.includes('ENOENT') || obs.result.includes('no such file')) {
          return 'file_not_found';
        }
        if (obs.result.includes('SQLITE_ERROR') || obs.result.includes('syntax error')) {
          return 'sql_error';
        }
        if (obs.result.includes('ECONNREFUSED') || obs.result.includes('connection refused')) {
          return 'connection_refused';
        }
        if (obs.result.includes('permission') || obs.result.includes('denied')) {
          return 'permission_denied';
        }
        return obs.assessment.reason || 'unknown_error';
      }
    }
    return 'none';
  }

  /**
   * 根据错误类型建议替代工具。
   */
  private suggestAlternativeTool(errorType: string): string | undefined {
    const alternatives: Record<string, string> = {
      'sql_error': 'db_query',
      'file_not_found': 'file_listDir',
      'network_timeout': 'web_search',
      'connection_refused': 'web_fetch',
      'permission_denied': 'system_info',
    };
    return alternatives[errorType];
  }

  /**
   * 重置检测器状态。
   */
  reset(): void {
    this.history = [];
    this.consecutiveSimilarCount = 0;
    this.lastSimilarity = 0;
    this.escalationLevel = 0;
  }

  /**
   * 获取历史记录。
   */
  getHistory(): ObservationHistory[] {
    return [...this.history];
  }
}
