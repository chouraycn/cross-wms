import { logger } from '../../logger.js';
import type {
  ContextEngineConfig,
  ContextEngineInfo,
  AgentMessage,
  IngestResult,
  IngestBatchResult,
  AssembleResult,
  CompactResult,
  ContextEngineStats,
  MemorySearchOptions,
  MemorySearchResult,
  ContextEngineSessionState,
  ContextEngineRuntimeContext,
  ContextEngine,
  BootstrapResult,
  ContextEngineMaintenanceResult,
  ContextEngineFactoryContext,
} from './types.js';
import { estimateMessagesTokens, estimateTokens } from '../contextWindowGuard.js';
import { buildCompactionPlan } from '../compactionPlanning.js';
import { truncateContextForModel } from '../contextTruncate.js';
import {
  hybridSearchMemory,
  insertMemoryWithChunks,
  getMemoryStats,
  type VecSearchResult,
} from '../vecMemoryStore.js';

export const LEGACY_ENGINE_CONFIG: ContextEngineConfig = {
  engineId: 'legacy',
  displayName: 'Legacy Context Engine',
  version: '1.0.0',
  description: '基于现有压缩和截断系统的传统上下文引擎，提供向后兼容',
  defaultMemorySync: {
    strategy: 'on_search',
    batchSize: 20,
  },
};

export const LEGACY_ENGINE_INFO: ContextEngineInfo = {
  id: 'legacy',
  name: 'Legacy Context Engine',
  version: '1.0.0',
  description: '基于现有压缩和截断系统的传统上下文引擎，提供向后兼容',
  ownsCompaction: true,
  turnMaintenanceMode: 'foreground',
  defaultMemorySync: {
    strategy: 'on_search',
    batchSize: 20,
  },
};

export class LegacyContextEngine implements ContextEngine {
  readonly info: ContextEngineInfo = LEGACY_ENGINE_INFO;
  readonly config: ContextEngineConfig = LEGACY_ENGINE_CONFIG;

  private sessionId: string = '';
  private agentId: string = 'default';
  private messages: AgentMessage[] = [];
  private systemMessages: AgentMessage[] = [];
  private compactedSummary: string = '';
  private compactedCount: number = 0;
  private lastCompactTime: number | null = null;
  private createdAt: number = 0;
  private lastModified: number = 0;
  private memoryAvailable: boolean = true;
  private lastSyncedMessageIndex: number = 0;

  async bootstrap(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
    initialMessages?: AgentMessage[];
    runtimeSettings?: unknown;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<BootstrapResult> {
    const { sessionId, initialMessages } = params;
    this.sessionId = sessionId;
    this.createdAt = Date.now();
    this.lastModified = this.createdAt;

    let importedMessages = 0;

    if (initialMessages && initialMessages.length > 0) {
      const sysMsgs: AgentMessage[] = [];
      const otherMsgs: AgentMessage[] = [];
      for (const msg of initialMessages) {
        if (msg.role === 'system') {
          sysMsgs.push(msg);
        } else {
          otherMsgs.push(msg);
        }
      }
      this.systemMessages = sysMsgs;
      this.messages = otherMsgs;
      this.lastSyncedMessageIndex = 0;
      importedMessages = initialMessages.length;
    }

    logger.debug(`[LegacyContextEngine] 引导完成: session=${sessionId}, 初始消息=${initialMessages?.length ?? 0}`);

    return {
      bootstrapped: true,
      importedMessages,
    };
  }

  async ingest(params: {
    sessionId: string;
    sessionKey?: string;
    message: AgentMessage;
    isHeartbeat?: boolean;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<IngestResult> {
    const { message } = params;
    let added = 0;
    let skipped = 0;
    let tokensAdded = 0;

    if (!message || !message.role) {
      skipped++;
    } else {
      if (message.role === 'system') {
        this.systemMessages.push({ ...message, timestamp: message.timestamp ?? Date.now() });
      } else {
        this.messages.push({ ...message, timestamp: message.timestamp ?? Date.now() });
      }
      added++;
      tokensAdded += estimateTokens(message.content || '');
    }

    this.lastModified = Date.now();

    return {
      ingested: added > 0,
      added,
      skipped,
      tokensAdded,
    };
  }

  async ingestBatch(params: {
    sessionId: string;
    sessionKey?: string;
    messages: AgentMessage[];
    isHeartbeat?: boolean;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<IngestBatchResult> {
    const { messages, runtimeContext } = params;
    let totalAdded = 0;
    let totalSkipped = 0;
    let totalTokensAdded = 0;

    for (const msg of messages) {
      const result = await this.ingest({
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        message: msg,
        isHeartbeat: params.isHeartbeat,
        runtimeContext,
      });
      totalAdded += result.added ?? 0;
      totalSkipped += result.skipped ?? 0;
      totalTokensAdded += result.tokensAdded ?? 0;
    }

    return {
      ingestedCount: totalAdded,
      added: totalAdded,
      skipped: totalSkipped,
      tokensAdded: totalTokensAdded,
    };
  }

  async assemble(params: {
    sessionId: string;
    sessionKey?: string;
    messages: AgentMessage[];
    tokenBudget?: number;
    availableTools?: Set<string>;
    model?: string;
    prompt?: string;
    runtimeSettings?: unknown;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<AssembleResult> {
    const { tokenBudget, runtimeContext } = params;
    const contextWindow = runtimeContext?.tokenBudget ?? tokenBudget ?? 128000;
    const allMessages = this.buildFullMessageList();
    const totalTokens = estimateMessagesTokens(allMessages);

    if (totalTokens <= contextWindow * 0.9) {
      return {
        messages: allMessages,
        estimatedTokens: totalTokens,
        compactedCount: this.compactedCount,
        promptAuthority: 'assembled',
      };
    }

    const plan = buildCompactionPlan(
      allMessages.map(m => ({
        role: m.role,
        content: m.content || '',
        toolCallId: m.toolCallId,
        toolName: m.toolName,
        id: m.id,
        metadata: m.metadata,
      })),
      {
        contextWindowTokens: contextWindow,
        keepRecentMessages: 6,
      }
    );

    if (!plan.shouldCompact) {
      return {
        messages: allMessages,
        estimatedTokens: totalTokens,
        compactedCount: this.compactedCount,
        promptAuthority: 'assembled',
      };
    }

    const truncated = truncateContextForModel(
      allMessages.map(m => ({
        role: m.role,
        content: m.content || '',
        tool_calls: m.toolCalls,
        tool_call_id: m.toolCallId,
      })),
      contextWindow,
      runtimeContext?.maxOutputTokens ?? 1000,
      runtimeContext?.toolCount ?? 0
    );

    const resultMessages: AgentMessage[] = truncated.messages.map((m, i) => ({
      id: `${i}`,
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      toolCallId: (m as { tool_call_id?: string }).tool_call_id,
      toolCalls: (m as { tool_calls?: unknown[] }).tool_calls,
      timestamp: Date.now(),
    }));

    return {
      messages: resultMessages,
      estimatedTokens: estimateMessagesTokens(resultMessages),
      compactedCount: this.compactedCount,
      promptAuthority: 'assembled',
    };
  }

  async afterTurn(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
    messages: AgentMessage[];
    prePromptMessageCount: number;
    autoCompactionSummary?: string;
    isHeartbeat?: boolean;
    tokenBudget?: number;
    runtimeSettings?: unknown;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<void> {
    const { messages, runtimeContext } = params;
    await this.ingestBatch({
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      messages,
      isHeartbeat: params.isHeartbeat,
      runtimeContext,
    });

    const totalTokens = estimateMessagesTokens(this.buildFullMessageList());
    const contextWindow = runtimeContext?.tokenBudget ?? 128000;
    if (totalTokens > contextWindow * 0.7) {
      await this.compact({
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        sessionFile: params.sessionFile,
        force: false,
        runtimeContext,
      });
    }

    await this.autoSyncMemory();
  }

  async compact(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: 'budget' | 'threshold';
    customInstructions?: string;
    runtimeSettings?: unknown;
    runtimeContext?: ContextEngineRuntimeContext;
    abortSignal?: AbortSignal;
  }): Promise<CompactResult> {
    const { force = false, runtimeContext } = params;
    const contextWindow = runtimeContext?.tokenBudget ?? 128000;
    const allMessages = this.buildFullMessageList();
    const plan = buildCompactionPlan(
      allMessages.map(m => ({
        role: m.role,
        content: m.content || '',
        toolCallId: m.toolCallId,
        toolName: m.toolName,
        id: m.id,
        metadata: m.metadata,
      })),
      {
        contextWindowTokens: contextWindow,
        keepRecentMessages: 6,
      }
    );

    if (!plan.shouldCompact && !force) {
      return {
        ok: true,
        compacted: false,
        didCompact: false,
        reason: plan.reason ?? '不需要压缩',
        messagesRemoved: 0,
        tokensSaved: 0,
      };
    }

    const oldCount = this.messages.length;
    const oldTokens = estimateMessagesTokens(allMessages);

    const splitIndex = Math.max(0, this.messages.length - 6);
    const toSummarize = this.messages.slice(0, splitIndex);
    const recentMessages = this.messages.slice(splitIndex);

    if (toSummarize.length > 0) {
      this.compactedSummary = this.generateFallbackSummary(toSummarize);
      this.compactedCount += toSummarize.length;
      this.messages = recentMessages;
    }

    this.lastCompactTime = Date.now();
    this.lastModified = Date.now();

    const newTokens = estimateMessagesTokens(this.buildFullMessageList());
    const tokensSaved = oldTokens - newTokens;

    logger.info(
      `[LegacyContextEngine] 压缩完成: 消息 ${oldCount} → ${this.messages.length}, ` +
      `token 节省 ${tokensSaved}`
    );

    return {
      ok: true,
      compacted: true,
      didCompact: true,
      messagesRemoved: oldCount - this.messages.length,
      tokensSaved,
      summaryLength: this.compactedSummary.length,
      strategy: 'fallback_extractive',
      result: {
        summary: this.compactedSummary,
        tokensBefore: oldTokens,
        tokensAfter: newTokens,
        sessionId: this.sessionId,
      },
    };
  }

  async searchMemory(params: {
    sessionId: string;
    sessionKey?: string;
    query: string;
    topK?: number;
    minScore?: number;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<MemorySearchResult[]> {
    const { query, topK } = params;
    logger.debug(`[LegacyContextEngine] searchMemory 开始: session=${this.sessionId}, query="${query}"`);

    if (!this.memoryAvailable) {
      logger.debug('[LegacyContextEngine] memory 不可用');
      return [];
    }

    await this.syncAllToMemory();

    try {
      const results: VecSearchResult[] = await hybridSearchMemory(query, {
        topK: topK ?? 10,
        useMMR: true,
      });

      const memoryResults: MemorySearchResult[] = results.map(r => ({
        id: String(r.id),
        content: r.text,
        score: r.similarity,
        source: (r.metadata?.source as string) || 'unknown',
        timestamp: r.metadata?.timestamp as number | undefined,
        metadata: r.metadata,
      }));

      logger.debug(`[LegacyContextEngine] 向量搜索成功: ${results.length} 结果`);

      if (memoryResults.length === 0) {
        logger.debug('[LegacyContextEngine] 向量搜索结果为空，使用内存搜索');
        return this.fallbackTextSearch({ query, topK });
      }

      return memoryResults;
    } catch (err) {
      logger.warn(
        '[LegacyContextEngine] 向量搜索异常，使用内存搜索:',
        err instanceof Error ? err.message : String(err)
      );

      return this.fallbackTextSearch({ query, topK });
    }
  }

  private fallbackTextSearch(options: MemorySearchOptions): MemorySearchResult[] {
    const queryLower = options.query.toLowerCase();
    const memoryResults: MemorySearchResult[] = this.messages
      .filter(m => {
        const content = typeof m.content === 'string' ? m.content : '';
        return content.toLowerCase().includes(queryLower);
      })
      .slice(0, options.topK ?? 10)
      .map((m, i) => ({
        id: `mem-${i}`,
        content: typeof m.content === 'string' ? m.content : '',
        score: 0.5,
        source: 'memory' as const,
        timestamp: m.timestamp,
        metadata: { role: m.role },
      }));

    logger.debug(`[LegacyContextEngine] 内存搜索: ${memoryResults.length} 结果`);

    if (options.timeDecayFactor && options.timeDecayFactor > 0) {
      return this.applyTimeDecay(memoryResults, options.timeDecayFactor);
    }

    return memoryResults;
  }

  async getStats(): Promise<ContextEngineStats> {
    const allMessages = this.buildFullMessageList();
    return {
      totalMessages: allMessages.length,
      totalTokens: estimateMessagesTokens(allMessages),
      systemMessages: this.systemMessages.length,
      compactedCount: this.compactedCount,
      memoryItems: await this.getMemoryCount(),
      lastCompactTime: this.lastCompactTime ?? undefined,
    };
  }

  async maintain(params: {
    sessionId: string;
    sessionKey?: string;
    sessionFile?: string;
    runtimeSettings?: unknown;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<ContextEngineMaintenanceResult> {
    const { runtimeContext } = params;
    await this.syncAllToMemory();

    const totalTokens = estimateMessagesTokens(this.buildFullMessageList());
    const contextWindow = runtimeContext?.tokenBudget ?? 128000;
    if (totalTokens > contextWindow * 0.8) {
      await this.compact({
        sessionId: params.sessionId,
        sessionKey: params.sessionKey,
        sessionFile: params.sessionFile,
        force: true,
        runtimeContext,
      });
    }

    logger.debug('[LegacyContextEngine] 维护完成');

    return {
      changed: false,
      bytesFreed: 0,
      rewrittenEntries: 0,
    };
  }

  async dispose(): Promise<void> {
    this.messages = [];
    this.systemMessages = [];
    this.compactedSummary = '';
    this.compactedCount = 0;
    this.lastCompactTime = null;
    this.memoryAvailable = true;
    this.lastSyncedMessageIndex = 0;
    logger.debug(`[LegacyContextEngine] 已释放: session=${this.sessionId}`);
  }

  getSessionState(): ContextEngineSessionState | null {
    if (!this.sessionId) return null;
    return {
      sessionId: this.sessionId,
      agentId: this.agentId,
      createdAt: this.createdAt,
      lastModified: this.lastModified,
      messageCount: this.messages.length + this.systemMessages.length,
      tokenCount: estimateMessagesTokens(this.buildFullMessageList()),
    };
  }

  private buildFullMessageList(): AgentMessage[] {
    const result: AgentMessage[] = [...this.systemMessages];

    if (this.compactedSummary) {
      result.push({
        id: 'compacted-summary',
        role: 'system',
        content: `[历史对话摘要] ${this.compactedSummary}`,
        metadata: { compacted: true, compactedMessages: this.compactedCount },
        timestamp: this.lastCompactTime ?? Date.now(),
      });
    }

    result.push(...this.messages);
    return result;
  }

  private generateFallbackSummary(messages: AgentMessage[]): string {
    const userMsgs = messages.filter(m => m.role === 'user');
    const assistantMsgs = messages.filter(m => m.role === 'assistant');
    const toolCount = messages.filter(m => m.role === 'tool').length;

    const firstUserMsg = userMsgs[0]?.content?.substring(0, 200) ?? '';
    const lastUserMsg = userMsgs[userMsgs.length - 1]?.content?.substring(0, 200) ?? '';

    return `对话历史共 ${messages.length} 条消息（用户 ${userMsgs.length} 条，助手 ${assistantMsgs.length} 条，工具调用 ${toolCount} 次）。\n初始需求：${firstUserMsg}...\n最新问题：${lastUserMsg}...`;
  }

  private async getMemoryCount(): Promise<number> {
    if (!this.memoryAvailable) return 0;
    try {
      const stats = getMemoryStats();
      return stats?.totalMemories ?? 0;
    } catch {
      return 0;
    }
  }

  private async autoSyncMemory(): Promise<void> {
    if (!this.memoryAvailable) return;

    const unsynced = this.messages.slice(this.lastSyncedMessageIndex);
    if (unsynced.length === 0) return;

    const userMsgs = unsynced.filter(m => m.role === 'user' && m.content?.length > 10);

    if (userMsgs.length > 0) {
      const contents = userMsgs.map(m => m.content || '');

      try {
        for (const content of contents) {
          await insertMemoryWithChunks(content, {
            source: 'conversation',
            category: 'conversation',
            agentId: this.agentId,
            metadata: {
              sessionId: this.sessionId,
              agentId: this.agentId,
              role: 'user',
              timestamp: Date.now(),
            },
          });
        }

        logger.debug(`[LegacyContextEngine] 同步 ${contents.length} 条消息到记忆`);
      } catch (err) {
        logger.warn(
          '[LegacyContextEngine] 记忆同步失败:',
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    this.lastSyncedMessageIndex = this.messages.length;
  }

  private async syncAllToMemory(): Promise<void> {
    if (this.lastSyncedMessageIndex >= this.messages.length) return Promise.resolve();
    return this.autoSyncMemory();
  }

  private applyTimeDecay(results: MemorySearchResult[], decayFactor: number): MemorySearchResult[] {
    const now = Date.now();
    const halfLifeMs = 7 * 24 * 60 * 60 * 1000;

    const scored = results
      .map(r => {
        if (!r.timestamp) return { ...r, adjustedScore: r.score };
        const ageMs = now - r.timestamp;
        const decay = Math.pow(0.5, ageMs / halfLifeMs) ** (decayFactor / 2);
        const adjustedScore = r.score * Math.max(decay, 0.1);
        return { ...r, adjustedScore };
      })
      .sort((a, b) => (b as { adjustedScore: number }).adjustedScore - (a as { adjustedScore: number }).adjustedScore);

    return scored.map(r => {
      const { adjustedScore: _adjustedScore, ...rest } = r as { adjustedScore: number } & MemorySearchResult;
      return rest;
    });
  }
}

export function createLegacyContextEngine(
  ctx?: ContextEngineFactoryContext,
): LegacyContextEngine {
  const engine = new LegacyContextEngine();
  if (ctx?.sessionId) {
    engine.bootstrap({ sessionId: ctx.sessionId });
  }
  return engine;
}

export function createLegacyContextEngineLegacy(
  sessionId: string,
  options?: Record<string, unknown>
): LegacyContextEngine {
  const engine = new LegacyContextEngine();
  engine.bootstrap({
    sessionId,
    initialMessages: options?.initialMessages as AgentMessage[] | undefined,
  });
  return engine;
}
