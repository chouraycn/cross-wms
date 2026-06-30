/**
 * Compaction Deduplication - 重复消息去重
 *
 * 在压缩前识别并合并重复的用户消息
 */
import { logger } from '../logger.js';
import type { AgentMessage } from './context-engine/types.js';

/** 重复消息检测配置 */
export interface DeduplicationConfig {
  /** 启用去重 */
  enabled: boolean;
  /** 连续重复消息阈值 */
  consecutiveThreshold: number;
  /** 相似度阈值 (0-1) */
  similarityThreshold: number;
  /** 最大去重消息数 */
  maxDedupeMessages: number;
}

/** 默认去重配置 */
export const DEFAULT_DEDUP_CONFIG: DeduplicationConfig = {
  enabled: true,
  consecutiveThreshold: 2,
  similarityThreshold: 0.8,
  maxDedupeMessages: 10,
};

/** 去重结果 */
export interface DeduplicationResult {
  messages: AgentMessage[];
  duplicatesRemoved: number;
  duplicates: Array<{
    originalIndex: number;
    duplicateIndex: number;
    reason: string;
  }>;
}

/**
 * Levenshtein 编辑距离
 */
function _levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;

  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * 检测是否为连续重复消息
 */
function isConsecutiveDuplicate(
  messages: AgentMessage[],
  currentIndex: number,
  consecutiveThreshold: number,
): boolean {
  if (currentIndex === 0) {
    return false;
  }

  const currentMsg = messages[currentIndex];
  let consecutiveCount = 1;

  // 向前查找连续的相同消息
  for (let i = currentIndex - 1; i >= 0; i--) {
    const prevMsg = messages[i];

    if (prevMsg.role !== currentMsg.role) {
      break;
    }

    const content1 = typeof currentMsg.content === 'string' ? currentMsg.content : '';
    const content2 = typeof prevMsg.content === 'string' ? prevMsg.content : '';

    if (content1 === content2) {
      consecutiveCount++;
    } else {
      break;
    }
  }

  return consecutiveCount >= consecutiveThreshold;
}

/**
 * 去除重复用户消息
 */
export function deduplicateUserMessages(
  messages: AgentMessage[],
  config: Partial<DeduplicationConfig> = {},
): DeduplicationResult {
  const fullConfig: DeduplicationConfig = { ...DEFAULT_DEDUP_CONFIG, ...config };

  if (!fullConfig.enabled || messages.length === 0) {
    return { messages, duplicatesRemoved: 0, duplicates: [] };
  }

  const deduplicated: AgentMessage[] = [];
  const duplicates: DeduplicationResult['duplicates'] = [];
  let duplicatesRemoved = 0;
  const seenUserContents: Map<string, number> = new Map();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];

    // 只对用户消息进行去重
    if (msg.role === 'user') {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

      // 检测连续重复
      if (isConsecutiveDuplicate(messages, i, fullConfig.consecutiveThreshold)) {
        duplicates.push({
          originalIndex: i - 1,
          duplicateIndex: i,
          reason: 'consecutive_duplicate',
        });
        duplicatesRemoved++;
        consecutiveUserCount++;
        logger.debug(`[Deduplication] Removed consecutive duplicate at index ${i}`);
        continue;
      }

      // 检测内容重复
      const prevIndex = seenUserContents.get(content);
      if (prevIndex !== undefined) {
        duplicates.push({
          originalIndex: prevIndex,
          duplicateIndex: i,
          reason: 'content_duplicate',
        });
        duplicatesRemoved++;
        logger.debug(`[Deduplication] Removed content duplicate at index ${i}`);
        continue;
      }

      seenUserContents.set(content, deduplicated.length);
    } else {
      // 非用户消息重置计数器和已见内容
      seenUserContents.clear();
    }

    deduplicated.push(msg);

    // 限制去重数量
    if (duplicatesRemoved >= fullConfig.maxDedupeMessages) {
      logger.debug(`[Deduplication] Reached max deduplication limit: ${fullConfig.maxDedupeMessages}`);
      break;
    }
  }

  return { messages: deduplicated, duplicatesRemoved, duplicates };
}

/**
 * 合并连续的系统提示（保留最后一个）
 */
export function mergeConsecutiveSystemMessages(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const result: AgentMessage[] = [];
  let lastSystemContent: string | null = null;

  for (const msg of messages) {
    if (msg.role === 'system') {
      const content = typeof msg.content === 'string' ? msg.content : '';

      if (lastSystemContent !== null && content === lastSystemContent) {
        // 跳过重复的系统消息
        logger.debug('[Deduplication] Merged duplicate system message');
        continue;
      }

      lastSystemContent = content;
    } else {
      lastSystemContent = null;
    }

    result.push(msg);
  }

  return result;
}

/**
 * 压缩前预处理
 */
export function preprocessForCompaction(
  messages: AgentMessage[],
  options: {
    deduplicate?: Partial<DeduplicationConfig>;
    mergeSystem?: boolean;
  } = {},
): AgentMessage[] {
  let processed = [...messages];

  // 1. 去重
  if (options.deduplicate?.enabled !== false) {
    const dedupResult = deduplicateUserMessages(processed, options.deduplicate);
    processed = dedupResult.messages;
    logger.debug(`[Deduplication] Removed ${dedupResult.duplicatesRemoved} duplicates`);
  }

  // 2. 合并连续系统消息
  if (options.mergeSystem) {
    const before = processed.length;
    processed = mergeConsecutiveSystemMessages(processed);
    logger.debug(`[Deduplication] Merged ${before - processed.length} system messages`);
  }

  return processed;
}
