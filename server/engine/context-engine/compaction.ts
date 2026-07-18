import { logger } from '../../logger.js';
import { TokenBudgetManager } from './token-budget.js';
import { Summarizer } from './summarizer.js';
import { RelevanceScorer } from './relevance-scorer.js';

export type CompactionStrategy = 'summary' | 'truncate' | 'importance' | 'hybrid';

export interface CompactionConfig {
  strategy: CompactionStrategy;
  targetTokenReduction: number;
  minMessagesToKeep: number;
  preserveSystemMessages: boolean;
  preserveRecentMessages: number;
  preserveToolResults: boolean;
  importanceThreshold: number;
  summaryPosition: 'beginning' | 'end' | 'replace';
}

export interface CompactionResult {
  success: boolean;
  strategy: CompactionStrategy;
  originalMessageCount: number;
  compactedMessageCount: number;
  originalTokens: number;
  compactedTokens: number;
  tokensSaved: number;
  messagesRemoved: number;
  messagesSummarized: number;
  summary?: string;
  removedMessageIds: string[];
  durationMs: number;
}

export interface MessageForCompaction {
  id: string;
  role: string;
  content: string;
  timestamp?: number;
  toolCallId?: string;
  toolName?: string;
  isError?: boolean;
  metadata?: Record<string, unknown>;
  importance?: number;
}

const DEFAULT_CONFIG: Required<CompactionConfig> = {
  strategy: 'hybrid',
  targetTokenReduction: 0.5,
  minMessagesToKeep: 5,
  preserveSystemMessages: true,
  preserveRecentMessages: 10,
  preserveToolResults: true,
  importanceThreshold: 0.3,
  summaryPosition: 'beginning',
};

export class ContextCompactor {
  private config: Required<CompactionConfig>;
  private tokenBudget: TokenBudgetManager;
  private summarizer: Summarizer;
  private relevanceScorer: RelevanceScorer;

  constructor(
    config: Partial<CompactionConfig> = {},
    tokenBudget?: TokenBudgetManager,
    summarizer?: Summarizer,
    relevanceScorer?: RelevanceScorer
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenBudget = tokenBudget || new TokenBudgetManager();
    this.summarizer = summarizer || new Summarizer();
    this.relevanceScorer = relevanceScorer || new RelevanceScorer();
    logger.debug('[ContextCompactor] 上下文压缩器初始化完成');
  }

  compact(
    messages: MessageForCompaction[],
    targetTokens?: number,
    options?: Partial<CompactionConfig>
  ): CompactionResult {
    const startTime = Date.now();
    const config = { ...this.config, ...options };
    const originalCount = messages.length;
    const originalTokens = this.tokenBudget.estimateMessagesTokens(messages);

    if (messages.length <= config.minMessagesToKeep) {
      return {
        success: false,
        strategy: config.strategy,
        originalMessageCount: originalCount,
        compactedMessageCount: originalCount,
        originalTokens,
        compactedTokens: originalTokens,
        tokensSaved: 0,
        messagesRemoved: 0,
        messagesSummarized: 0,
        removedMessageIds: [],
        durationMs: Date.now() - startTime,
      };
    }

    const target = targetTokens || Math.floor(originalTokens * (1 - config.targetTokenReduction));

    let result: CompactionResult;
    switch (config.strategy) {
      case 'summary':
        result = this.compactWithSummary(messages, target, config);
        break;
      case 'truncate':
        result = this.compactWithTruncation(messages, target, config);
        break;
      case 'importance':
        result = this.compactWithImportance(messages, target, config);
        break;
      case 'hybrid':
      default:
        result = this.compactHybrid(messages, target, config);
    }

    result.durationMs = Date.now() - startTime;

    logger.info(
      `[ContextCompactor] 压缩完成: 策略=${config.strategy}, ` +
      `消息数=${originalCount}->${result.compactedMessageCount}, ` +
      `tokens=${originalTokens}->${result.compactedTokens}, ` +
      `节省=${result.tokensSaved}`
    );

    return result;
  }

  private compactWithSummary(
    messages: MessageForCompaction[],
    targetTokens: number,
    config: Required<CompactionConfig>
  ): CompactionResult {
    const originalTokens = this.tokenBudget.estimateMessagesTokens(messages);
    const removedIds: string[] = [];
    let messagesSummarized = 0;

    const { preserved, toSummarize } = this.splitMessages(messages, config);

    if (toSummarize.length === 0) {
      return {
        success: false,
        strategy: 'summary',
        originalMessageCount: messages.length,
        compactedMessageCount: messages.length,
        originalTokens,
        compactedTokens: originalTokens,
        tokensSaved: 0,
        messagesRemoved: 0,
        messagesSummarized: 0,
        removedMessageIds: [],
        durationMs: 0,
      };
    }

    const summaryText = toSummarize.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    const summaryResult = this.summarizer.summarize(summaryText, {
      maxSummaryLength: Math.floor(targetTokens * 0.8),
    });

    const summaryMessage: MessageForCompaction = {
      id: `summary_${Date.now()}`,
      role: 'system',
      content: `[对话摘要]\n${summaryResult.summary}`,
      timestamp: Date.now(),
      metadata: {
        isCompactionSummary: true,
        summarizedMessages: toSummarize.length,
      },
    };

    for (const msg of toSummarize) {
      removedIds.push(msg.id);
      messagesSummarized++;
    }

    let compacted: MessageForCompaction[];
    if (config.summaryPosition === 'beginning') {
      compacted = [summaryMessage, ...preserved];
    } else if (config.summaryPosition === 'end') {
      compacted = [...preserved, summaryMessage];
    } else {
      compacted = preserved;
    }

    const compactedTokens = this.tokenBudget.estimateMessagesTokens(compacted);

    return {
      success: true,
      strategy: 'summary',
      originalMessageCount: messages.length,
      compactedMessageCount: compacted.length,
      originalTokens,
      compactedTokens,
      tokensSaved: originalTokens - compactedTokens,
      messagesRemoved: toSummarize.length,
      messagesSummarized,
      summary: summaryResult.summary,
      removedMessageIds: removedIds,
      durationMs: 0,
    };
  }

  private compactWithTruncation(
    messages: MessageForCompaction[],
    targetTokens: number,
    config: Required<CompactionConfig>
  ): CompactionResult {
    const originalTokens = this.tokenBudget.estimateMessagesTokens(messages);
    const removedIds: string[] = [];

    const preserved = [...messages];
    let currentTokens = this.tokenBudget.estimateMessagesTokens(preserved);

    while (currentTokens > targetTokens && preserved.length > config.minMessagesToKeep) {
      const removeIndex = this.findMessageToRemove(preserved, config);
      if (removeIndex === -1) break;

      const removed = preserved.splice(removeIndex, 1)[0];
      removedIds.push(removed.id);
      currentTokens = this.tokenBudget.estimateMessagesTokens(preserved);
    }

    const compactedTokens = this.tokenBudget.estimateMessagesTokens(preserved);

    return {
      success: true,
      strategy: 'truncate',
      originalMessageCount: messages.length,
      compactedMessageCount: preserved.length,
      originalTokens,
      compactedTokens,
      tokensSaved: originalTokens - compactedTokens,
      messagesRemoved: removedIds.length,
      messagesSummarized: 0,
      removedMessageIds: removedIds,
      durationMs: 0,
    };
  }

  private compactWithImportance(
    messages: MessageForCompaction[],
    targetTokens: number,
    config: Required<CompactionConfig>
  ): CompactionResult {
    const originalTokens = this.tokenBudget.estimateMessagesTokens(messages);
    const removedIds: string[] = [];

    const scoredMessages = messages.map((msg, index) => ({
      message: msg,
      index,
      importance: this.calculateMessageImportance(msg, index, messages.length, config),
    }));

    scoredMessages.sort((a, b) => a.importance - b.importance);

    const preserved = [...messages];
    let currentTokens = this.tokenBudget.estimateMessagesTokens(preserved);

    for (const scored of scoredMessages) {
      if (currentTokens <= targetTokens || preserved.length <= config.minMessagesToKeep) break;

      const msgIndex = preserved.findIndex(m => m.id === scored.message.id);
      if (msgIndex === -1) continue;

      if (this.isMessageProtected(scored.message, config)) continue;

      preserved.splice(msgIndex, 1);
      removedIds.push(scored.message.id);
      currentTokens = this.tokenBudget.estimateMessagesTokens(preserved);
    }

    const compactedTokens = this.tokenBudget.estimateMessagesTokens(preserved);

    return {
      success: true,
      strategy: 'importance',
      originalMessageCount: messages.length,
      compactedMessageCount: preserved.length,
      originalTokens,
      compactedTokens,
      tokensSaved: originalTokens - compactedTokens,
      messagesRemoved: removedIds.length,
      messagesSummarized: 0,
      removedMessageIds: removedIds,
      durationMs: 0,
    };
  }

  private compactHybrid(
    messages: MessageForCompaction[],
    targetTokens: number,
    config: Required<CompactionConfig>
  ): CompactionResult {
    const originalTokens = this.tokenBudget.estimateMessagesTokens(messages);
    const removedIds: string[] = [];
    let messagesSummarized = 0;
    let currentMessages = [...messages];
    let summary: string | undefined;

    const importanceResult = this.compactWithImportance(currentMessages, targetTokens * 1.3, config);
    currentMessages = currentMessages.filter(m => !importanceResult.removedMessageIds.includes(m.id));
    removedIds.push(...importanceResult.removedMessageIds);

    const currentTokens = this.tokenBudget.estimateMessagesTokens(currentMessages);
    if (currentTokens > targetTokens) {
      const summaryResult = this.compactWithSummary(currentMessages, targetTokens, config);
      if (summaryResult.summary) {
        summary = summaryResult.summary;
        messagesSummarized = summaryResult.messagesSummarized;
        removedIds.push(...summaryResult.removedMessageIds);
      }
    }

    const finalMessages = currentMessages.filter(m => !removedIds.includes(m.id));
    const compactedTokens = this.tokenBudget.estimateMessagesTokens(finalMessages);

    return {
      success: true,
      strategy: 'hybrid',
      originalMessageCount: messages.length,
      compactedMessageCount: finalMessages.length,
      originalTokens,
      compactedTokens,
      tokensSaved: originalTokens - compactedTokens,
      messagesRemoved: removedIds.length,
      messagesSummarized,
      summary,
      removedMessageIds: removedIds,
      durationMs: 0,
    };
  }

  private splitMessages(
    messages: MessageForCompaction[],
    config: Required<CompactionConfig>
  ): {
    preserved: MessageForCompaction[];
    toSummarize: MessageForCompaction[];
  } {
    const preserved: MessageForCompaction[] = [];
    const toSummarize: MessageForCompaction[] = [];

    const recentStart = Math.max(0, messages.length - config.preserveRecentMessages);

    messages.forEach((msg, index) => {
      let shouldPreserve = false;

      if (config.preserveSystemMessages && msg.role === 'system') {
        shouldPreserve = true;
      }

      if (index >= recentStart) {
        shouldPreserve = true;
      }

      if (config.preserveToolResults && msg.role === 'tool') {
        shouldPreserve = true;
      }

      if (shouldPreserve || preserved.length < config.minMessagesToKeep) {
        preserved.push(msg);
      } else {
        toSummarize.push(msg);
      }
    });

    return { preserved, toSummarize };
  }

  private findMessageToRemove(
    messages: MessageForCompaction[],
    config: Required<CompactionConfig>
  ): number {
    const recentStart = Math.max(0, messages.length - config.preserveRecentMessages);

    for (let i = 0; i < recentStart; i++) {
      const msg = messages[i];
      if (this.isMessageProtected(msg, config)) continue;
      return i;
    }

    return -1;
  }

  private calculateMessageImportance(
    msg: MessageForCompaction,
    index: number,
    total: number,
    config: Required<CompactionConfig>
  ): number {
    let importance = msg.importance ?? 0.5;

    const recencyBonus = index / total;
    importance += recencyBonus * 0.3;

    if (msg.role === 'system') {
      importance += config.preserveSystemMessages ? 0.5 : 0.2;
    } else if (msg.role === 'user') {
      importance += 0.2;
    } else if (msg.role === 'assistant') {
      importance += 0.15;
    }

    if (msg.role === 'tool' && config.preserveToolResults) {
      importance += 0.3;
    }

    if (msg.isError) {
      importance += 0.2;
    }

    const contentLength = msg.content.length;
    if (contentLength > 500) {
      importance -= 0.1;
    }

    return Math.max(0, Math.min(1, importance));
  }

  private isMessageProtected(
    msg: MessageForCompaction,
    config: Required<CompactionConfig>
  ): boolean {
    if (config.preserveSystemMessages && msg.role === 'system') return true;
    if (config.preserveToolResults && msg.role === 'tool') return true;
    return false;
  }

  setStrategy(strategy: CompactionStrategy): void {
    this.config.strategy = strategy;
    logger.debug(`[ContextCompactor] 压缩策略已设置为: ${strategy}`);
  }

  getConfig(): CompactionConfig {
    return { ...this.config };
  }
}
