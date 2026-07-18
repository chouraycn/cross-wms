import { logger } from '../../logger.js';
import { TokenBudgetManager } from './token-budget.js';
import { ContextCompactor } from './compaction.js';
import { MemoryLayers } from './memory-layers.js';
import { RelevanceScorer } from './relevance-scorer.js';
import { ContextBuilder } from './context-builder.js';
import { Summarizer } from './summarizer.js';
import { VectorRetrieval } from './retrieval.js';
import { MessageFilter } from './message-filter.js';
import { ArtifactStore } from './artifact-store.js';
import { WorkspaceContext } from './workspace-context.js';
import { ToolContext } from './tool-context.js';
import type {
  AgentMessage,
  ContextEngineConfig,
  ContextEngineStats,
  AssembleResult,
  CompactResult,
  IngestResult,
  IngestBatchResult,
  BootstrapResult,
  MemorySearchResult,
  ContextEngineRuntimeSettings,
  ContextEngineRuntimeContext,
} from './types.js';

export interface EnhancedContextEngineConfig extends ContextEngineConfig {
  tokenBudget?: number;
  autoCompaction?: boolean;
  compactionThreshold?: number;
  memorySyncStrategy?: 'on_turn' | 'on_search' | 'interval' | 'manual';
  vectorStoreType?: 'milvus' | 'qdrant' | 'in-memory';
  vectorStoreEndpoint?: string;
}

export interface ContextWindowState {
  sessionId: string;
  messages: AgentMessage[];
  tokenCount: number;
  messageCount: number;
  compactionCount: number;
  lastCompactAt?: number;
  createdAt: number;
  lastModifiedAt: number;
}

export class EnhancedContextEngine {
  readonly config: EnhancedContextEngineConfig;
  readonly info: { id: string; name: string; version: string };

  private sessionId: string;
  private state: ContextWindowState;
  private tokenBudget: TokenBudgetManager;
  private compactor: ContextCompactor;
  private memoryLayers: MemoryLayers;
  private relevanceScorer: RelevanceScorer;
  private contextBuilder: ContextBuilder;
  private summarizer: Summarizer;
  private vectorRetrieval: VectorRetrieval;
  private messageFilter: MessageFilter;
  private artifactStore: ArtifactStore;
  private workspaceContext: WorkspaceContext;
  private toolContext: ToolContext;
  private bootstrapped: boolean = false;

  constructor(
    sessionId: string,
    config: Partial<EnhancedContextEngineConfig> = {}
  ) {
    this.sessionId = sessionId;
    this.config = {
      engineId: 'enhanced',
      displayName: 'Enhanced Context Engine',
      version: '2.0.0',
      ...config,
    } as EnhancedContextEngineConfig;

    this.info = {
      id: this.config.engineId,
      name: this.config.displayName,
      version: this.config.version,
    };

    this.state = {
      sessionId,
      messages: [],
      tokenCount: 0,
      messageCount: 0,
      compactionCount: 0,
      createdAt: Date.now(),
      lastModifiedAt: Date.now(),
    };

    this.tokenBudget = new TokenBudgetManager({
      totalBudget: config.tokenBudget || 128000,
    });

    this.compactor = new ContextCompactor();
    this.memoryLayers = new MemoryLayers();
    this.relevanceScorer = new RelevanceScorer();
    this.summarizer = new Summarizer();
    this.vectorRetrieval = new VectorRetrieval({
      type: config.vectorStoreType || 'in-memory',
      endpoint: config.vectorStoreEndpoint,
    });
    this.messageFilter = new MessageFilter();
    this.artifactStore = new ArtifactStore();
    this.workspaceContext = new WorkspaceContext();
    this.toolContext = new ToolContext();

    this.contextBuilder = new ContextBuilder(undefined, {
      tokenBudget: this.tokenBudget,
      memoryLayers: this.memoryLayers,
      relevanceScorer: this.relevanceScorer,
      messageFilter: this.messageFilter,
      summarizer: this.summarizer,
      artifactStore: this.artifactStore,
      workspaceContext: this.workspaceContext,
      toolContext: this.toolContext,
    });

    logger.debug(
      `[EnhancedContextEngine] 初始化完成: session=${sessionId}, ` +
      `tokenBudget=${config.tokenBudget || 128000}`
    );
  }

  async bootstrap(params: {
    sessionId: string;
    initialMessages?: AgentMessage[];
    runtimeSettings?: ContextEngineRuntimeSettings;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<BootstrapResult> {
    if (this.bootstrapped) {
      return { bootstrapped: false, reason: 'Already bootstrapped' };
    }

    if (params.initialMessages && params.initialMessages.length > 0) {
      for (const msg of params.initialMessages) {
        this.addMessageInternal(msg);
      }
    }

    this.bootstrapped = true;
    logger.info(
      `[EnhancedContextEngine] 启动完成: session=${params.sessionId}, ` +
      `初始消息=${params.initialMessages?.length || 0}`
    );

    return {
      bootstrapped: true,
      importedMessages: params.initialMessages?.length || 0,
    };
  }

  async ingest(params: {
    sessionId: string;
    message: AgentMessage;
    isHeartbeat?: boolean;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<IngestResult> {
    if (params.isHeartbeat) {
      return { ingested: false, skipped: 1 };
    }

    const filterResult = this.messageFilter.filter({
      id: params.message.id || `msg_${Date.now()}`,
      role: params.message.role,
      content: params.message.content,
      timestamp: params.message.timestamp,
    });

    if (filterResult.action === 'remove') {
      logger.debug(
        `[EnhancedContextEngine] 消息被过滤: ${filterResult.matchedRules.join(', ')}`
      );
      return { ingested: false, skipped: 1, tokensAdded: 0 };
    }

    const message = filterResult.truncatedContent
      ? { ...params.message, content: filterResult.truncatedContent }
      : params.message;

    const tokens = this.addMessageInternal(message);

    this.addToMemory(message);

    if (this.shouldCompact()) {
      await this.compact({ sessionId: params.sessionId });
    }

    return {
      ingested: true,
      added: 1,
      tokensAdded: tokens,
    };
  }

  async ingestBatch(params: {
    sessionId: string;
    messages: AgentMessage[];
    isHeartbeat?: boolean;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<IngestBatchResult> {
    let ingestedCount = 0;
    let skippedCount = 0;
    let totalTokens = 0;

    for (const msg of params.messages) {
      const result = await this.ingest({
        ...params,
        message: msg,
      });
      if (result.ingested) {
        ingestedCount++;
        totalTokens += result.tokensAdded || 0;
      } else {
        skippedCount++;
      }
    }

    return {
      ingestedCount,
      added: ingestedCount,
      skipped: skippedCount,
      tokensAdded: totalTokens,
    };
  }

  async assemble(params: {
    sessionId: string;
    messages: AgentMessage[];
    tokenBudget?: number;
    model?: string;
    prompt?: string;
    runtimeSettings?: ContextEngineRuntimeSettings;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<AssembleResult> {
    const query = params.prompt || '';
    const built = this.contextBuilder.build(this.state.messages, {
      query,
      maxTokens: params.tokenBudget,
    });

    const estimatedTokens = built.totalTokens;

    logger.debug(
      `[EnhancedContextEngine] 上下文组装完成: 消息=${built.messages.length}, ` +
      `tokens=${estimatedTokens}`
    );

    return {
      messages: built.messages,
      estimatedTokens,
      promptAuthority: 'assembled',
      compactedCount: this.state.compactionCount,
      memoryItemsUsed: built.memoryItems,
    };
  }

  async compact(params: {
    sessionId: string;
    tokenBudget?: number;
    force?: boolean;
    currentTokenCount?: number;
    compactionTarget?: 'budget' | 'threshold';
    customInstructions?: string;
    runtimeSettings?: ContextEngineRuntimeSettings;
    runtimeContext?: ContextEngineRuntimeContext;
    abortSignal?: AbortSignal;
  }): Promise<CompactResult> {
    const targetBudget = params.tokenBudget || Math.floor(this.tokenBudget.getStats().totalBudget * 0.7);
    const currentTokens = this.state.tokenCount;

    if (!params.force && currentTokens < targetBudget) {
      return {
        ok: true,
        compacted: false,
        reason: 'Token budget not exceeded',
        result: {
          tokensBefore: currentTokens,
          tokensAfter: currentTokens,
        },
        didCompact: false,
        messagesRemoved: 0,
        tokensSaved: 0,
      };
    }

    const compactionMessages = this.state.messages.map((msg, index) => ({
      id: msg.id || `msg_${index}`,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      importance: this.calculateMessageImportance(msg, index),
    }));

    const result = this.compactor.compact(compactionMessages, targetBudget);

    if (result.success) {
      const keptMessageIds = new Set(
        compactionMessages
          .filter(m => !result.removedMessageIds.includes(m.id))
          .map(m => m.id)
      );

      this.state.messages = this.state.messages.filter(msg => {
        const msgId = msg.id || '';
        return keptMessageIds.has(msgId);
      });

      this.state.tokenCount = this.tokenBudget.estimateMessagesTokens(this.state.messages);
      this.state.messageCount = this.state.messages.length;
      this.state.compactionCount++;
      this.state.lastCompactAt = Date.now();

      logger.info(
        `[EnhancedContextEngine] 压缩完成: 消息=${result.originalMessageCount}->${result.compactedMessageCount}, ` +
        `tokens=${currentTokens}->${this.state.tokenCount}`
      );
    }

    return {
      ok: result.success,
      compacted: result.success,
      reason: result.success ? undefined : 'Compaction failed',
      result: {
        summary: result.summary,
        tokensBefore: currentTokens,
        tokensAfter: this.state.tokenCount,
      },
      didCompact: result.success,
      messagesRemoved: result.messagesRemoved,
      tokensSaved: currentTokens - this.state.tokenCount,
      summaryLength: result.summary?.length,
      strategy: result.strategy,
    };
  }

  async searchMemory(params: {
    sessionId: string;
    query: string;
    topK?: number;
    minScore?: number;
    runtimeContext?: ContextEngineRuntimeContext;
  }): Promise<MemorySearchResult[]> {
    const memoryResults = this.memoryLayers.search({
      query: params.query,
      topK: params.topK || 10,
      minImportance: params.minScore,
    });

    const vectorResults = await this.vectorRetrieval.search(params.query, {
      topK: params.topK || 10,
      minScore: params.minScore,
      hybridSearch: true,
    });

    const combined: MemorySearchResult[] = [
      ...memoryResults.map(m => ({
        id: m.id,
        content: m.content,
        score: m.importance,
        source: m.source,
        timestamp: m.createdAt,
        metadata: m.metadata,
      })),
      ...vectorResults.map(v => ({
        id: v.id,
        content: v.content,
        score: v.score,
        source: v.source,
        timestamp: v.timestamp,
        metadata: v.metadata,
      })),
    ];

    combined.sort((a, b) => b.score - a.score);

    return combined.slice(0, params.topK || 10);
  }

  async getStats(): Promise<ContextEngineStats> {
    const memoryStats = this.memoryLayers.getStats();
    return {
      totalMessages: this.state.messageCount,
      totalTokens: this.state.tokenCount,
      systemMessages: this.state.messages.filter(m => m.role === 'system').length,
      compactedCount: this.state.compactionCount,
      memoryItems: memoryStats.totalItems,
      lastCompactTime: this.state.lastCompactAt,
    };
  }

  getSessionState() {
    return {
      sessionId: this.state.sessionId,
      agentId: '',
      createdAt: this.state.createdAt,
      lastModified: this.state.lastModifiedAt,
      messageCount: this.state.messageCount,
      tokenCount: this.state.tokenCount,
    };
  }

  getTokenBudget(): TokenBudgetManager {
    return this.tokenBudget;
  }

  getMemoryLayers(): MemoryLayers {
    return this.memoryLayers;
  }

  getRelevanceScorer(): RelevanceScorer {
    return this.relevanceScorer;
  }

  getSummarizer(): Summarizer {
    return this.summarizer;
  }

  getCompactor(): ContextCompactor {
    return this.compactor;
  }

  getMessageFilter(): MessageFilter {
    return this.messageFilter;
  }

  getArtifactStore(): ArtifactStore {
    return this.artifactStore;
  }

  getWorkspaceContext(): WorkspaceContext {
    return this.workspaceContext;
  }

  getToolContext(): ToolContext {
    return this.toolContext;
  }

  getVectorRetrieval(): VectorRetrieval {
    return this.vectorRetrieval;
  }

  getContextBuilder(): ContextBuilder {
    return this.contextBuilder;
  }

  getMessages(): AgentMessage[] {
    return [...this.state.messages];
  }

  async dispose(): Promise<void> {
    this.artifactStore.clear();
    this.memoryLayers.clearAll();
    this.vectorRetrieval.clear();
    this.toolContext.clearHistory();
    this.workspaceContext.clear();
    logger.debug(`[EnhancedContextEngine] 已释放: session=${this.sessionId}`);
  }

  private addMessageInternal(message: AgentMessage): number {
    const tokens = this.tokenBudget.estimateMessageTokens(message);
    this.state.messages.push(message);
    this.state.tokenCount += tokens;
    this.state.messageCount++;
    this.state.lastModifiedAt = Date.now();

    this.tokenBudget.addTokens('conversation', tokens);

    return tokens;
  }

  private addToMemory(message: AgentMessage): void {
    if (message.role === 'system') return;

    const importance = message.role === 'user' ? 0.8 : 0.6;

    this.memoryLayers.addItem(message.content, {
      layer: 'short-term',
      source: `conversation-${message.role}`,
      importance,
      sessionId: this.sessionId,
    });

    this.vectorRetrieval.insert({
      id: message.id || `msg_${Date.now()}_${Math.random()}`,
      content: message.content,
      source: message.role,
      timestamp: message.timestamp || Date.now(),
    });
  }

  private shouldCompact(): boolean {
    const usagePercent = this.tokenBudget.getUsagePercent();
    return usagePercent >= 85;
  }

  private calculateMessageImportance(message: AgentMessage, index: number): number {
    let importance = 0.5;

    if (message.role === 'system') importance += 0.3;
    if (message.role === 'user') importance += 0.2;

    const recencyBonus = index / Math.max(1, this.state.messageCount);
    importance += recencyBonus * 0.2;

    if (message.isError) importance += 0.2;

    const contentLength = message.content.length;
    if (contentLength > 500) importance -= 0.1;
    if (contentLength > 2000) importance -= 0.1;

    return Math.max(0, Math.min(1, importance));
  }
}
