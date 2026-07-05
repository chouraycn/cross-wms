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
function levenshteinDistance(str1: string, str2: string): number {
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
 * 计算两个字符串的相似度（0-1）
 */
function computeSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * 检测是否为连续重复消息（基于相似度阈值进行模糊匹配）
 */
function isConsecutiveDuplicate(
  msg: { role: string; content: string },
  prev: { role: string; content: string } | null,
  threshold: number,
): boolean {
  if (!prev || prev.role !== msg.role) return false;
  if (msg.content === prev.content) return true;

  // 使用相似度阈值进行模糊匹配
  const similarity = computeSimilarity(msg.content, prev.content);
  return similarity >= threshold;
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

      // 准备前一条消息用于连续重复检测
      const prevMsg = i > 0 ? messages[i - 1] : null;
      const prevContent = prevMsg
        ? (typeof prevMsg.content === 'string' ? prevMsg.content : JSON.stringify(prevMsg.content))
        : null;

      // 检测连续重复（基于相似度阈值进行模糊匹配）
      if (
        isConsecutiveDuplicate(
          { role: msg.role, content },
          prevMsg ? { role: prevMsg.role, content: prevContent ?? '' } : null,
          fullConfig.similarityThreshold,
        )
      ) {
        duplicates.push({
          originalIndex: i - 1,
          duplicateIndex: i,
          reason: 'consecutive_duplicate',
        });
        duplicatesRemoved++;
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
 * 去重连续重复的 assistant 消息
 *
 * 与上一条 assistant 消息内容完全相同的消息会被跳过，
 * 中间穿插的 user/tool/system 消息不会阻断比较。
 */
export function deduplicateAssistantMessages(
  messages: AgentMessage[],
): AgentMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const result: AgentMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant' && result.length > 0) {
      const lastAssistant = [...result].reverse().find(m => m.role === 'assistant');
      const lastContent = lastAssistant
        ? (typeof lastAssistant.content === 'string' ? lastAssistant.content : '')
        : '';
      const currentContent = typeof msg.content === 'string' ? msg.content : '';
      if (lastAssistant && currentContent === lastContent && currentContent !== '') {
        logger.debug('[Deduplication] Removed duplicate assistant message');
        continue; // 跳过重复
      }
    }
    result.push(msg);
  }

  return result;
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

    // 1.1 去重连续重复的 assistant 消息
    const beforeAssistantDedup = processed.length;
    processed = deduplicateAssistantMessages(processed);
    const assistantRemoved = beforeAssistantDedup - processed.length;
    if (assistantRemoved > 0) {
      logger.debug(`[Deduplication] Removed ${assistantRemoved} duplicate assistant messages`);
    }
  }

  // 2. 合并连续系统消息
  if (options.mergeSystem) {
    const before = processed.length;
    processed = mergeConsecutiveSystemMessages(processed);
    logger.debug(`[Deduplication] Merged ${before - processed.length} system messages`);
  }

  return processed;
}
