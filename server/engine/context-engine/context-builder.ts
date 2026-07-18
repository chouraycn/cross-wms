import { logger } from '../../logger.js';
import { TokenBudgetManager } from './token-budget.js';
import { MemoryLayers } from './memory-layers.js';
import { RelevanceScorer } from './relevance-scorer.js';
import { MessageFilter } from './message-filter.js';
import { Summarizer } from './summarizer.js';
import { ArtifactStore } from './artifact-store.js';
import { WorkspaceContext } from './workspace-context.js';
import { ToolContext } from './tool-context.js';
import type { AgentMessage } from './types.js';

export interface ContextBuilderConfig {
  includeSystemMessages: boolean;
  includeMemory: boolean;
  includeWorkspaceContext: boolean;
  includeToolContext: boolean;
  includeArtifacts: boolean;
  maxMemoryItems: number;
  maxWorkspaceFiles: number;
  maxToolHistory: number;
  maxArtifactItems: number;
  memoryQueryRelevance: boolean;
  workspaceQueryRelevance: boolean;
  tokenBudgetAware: boolean;
  preserveRecentMessages: number;
}

export interface BuildContextOptions {
  query?: string;
  maxTokens?: number;
  includeMemory?: boolean;
  includeWorkspace?: boolean;
  includeTools?: boolean;
  includeArtifacts?: boolean;
}

export interface BuiltContext {
  messages: AgentMessage[];
  totalTokens: number;
  memoryItems: number;
  workspaceFiles: number;
  toolHistoryItems: number;
  artifactItems: number;
  systemPromptAdditions: string[];
}

const DEFAULT_CONFIG: Required<ContextBuilderConfig> = {
  includeSystemMessages: true,
  includeMemory: true,
  includeWorkspaceContext: true,
  includeToolContext: true,
  includeArtifacts: true,
  maxMemoryItems: 10,
  maxWorkspaceFiles: 5,
  maxToolHistory: 5,
  maxArtifactItems: 3,
  memoryQueryRelevance: true,
  workspaceQueryRelevance: true,
  tokenBudgetAware: true,
  preserveRecentMessages: 10,
};

export class ContextBuilder {
  private config: Required<ContextBuilderConfig>;
  private tokenBudget: TokenBudgetManager;
  private memoryLayers: MemoryLayers;
  private relevanceScorer: RelevanceScorer;
  private messageFilter: MessageFilter;
  private summarizer: Summarizer;
  private artifactStore: ArtifactStore;
  private workspaceContext: WorkspaceContext;
  private toolContext: ToolContext;

  constructor(
    config: Partial<ContextBuilderConfig> = {},
    dependencies?: {
      tokenBudget?: TokenBudgetManager;
      memoryLayers?: MemoryLayers;
      relevanceScorer?: RelevanceScorer;
      messageFilter?: MessageFilter;
      summarizer?: Summarizer;
      artifactStore?: ArtifactStore;
      workspaceContext?: WorkspaceContext;
      toolContext?: ToolContext;
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokenBudget = dependencies?.tokenBudget || new TokenBudgetManager();
    this.memoryLayers = dependencies?.memoryLayers || new MemoryLayers();
    this.relevanceScorer = dependencies?.relevanceScorer || new RelevanceScorer();
    this.messageFilter = dependencies?.messageFilter || new MessageFilter();
    this.summarizer = dependencies?.summarizer || new Summarizer();
    this.artifactStore = dependencies?.artifactStore || new ArtifactStore();
    this.workspaceContext = dependencies?.workspaceContext || new WorkspaceContext();
    this.toolContext = dependencies?.toolContext || new ToolContext();
    logger.debug('[ContextBuilder] 上下文构建器初始化完成');
  }

  build(
    conversationMessages: AgentMessage[],
    options: BuildContextOptions = {}
  ): BuiltContext {
    const {
      query = '',
      maxTokens,
      includeMemory = this.config.includeMemory,
      includeWorkspace = this.config.includeWorkspaceContext,
      includeTools = this.config.includeToolContext,
      includeArtifacts = this.config.includeArtifacts,
    } = options;

    const contextMessages: AgentMessage[] = [];
    const systemPromptAdditions: string[] = [];
    let memoryItems = 0;
    let workspaceFiles = 0;
    let toolHistoryItems = 0;
    let artifactItems = 0;

    if (this.config.includeSystemMessages) {
      const systemMessages = conversationMessages.filter(m => m.role === 'system');
      contextMessages.push(...systemMessages);
    }

    if (includeMemory) {
      const memoryContext = this.buildMemoryContext(query);
      if (memoryContext) {
        systemPromptAdditions.push(memoryContext);
        memoryItems = this.config.maxMemoryItems;
      }
    }

    if (includeWorkspace) {
      const workspaceContextStr = this.buildWorkspaceContext(query);
      if (workspaceContextStr) {
        systemPromptAdditions.push(workspaceContextStr);
        workspaceFiles = this.config.maxWorkspaceFiles;
      }
    }

    if (includeTools) {
      const toolContextStr = this.buildToolContext();
      if (toolContextStr) {
        systemPromptAdditions.push(toolContextStr);
        toolHistoryItems = this.config.maxToolHistory;
      }
    }

    if (includeArtifacts) {
      const artifactContext = this.buildArtifactContext(query);
      if (artifactContext) {
        systemPromptAdditions.push(artifactContext);
        artifactItems = this.config.maxArtifactItems;
      }
    }

    const nonSystemMessages = conversationMessages.filter(m => m.role !== 'system');
    const recentMessages = nonSystemMessages.slice(-this.config.preserveRecentMessages);
    contextMessages.push(...recentMessages);

    const totalTokens = this.tokenBudget.estimateMessagesTokens(contextMessages);

    logger.debug(
      `[ContextBuilder] 上下文构建完成: 消息=${contextMessages.length}, ` +
      `tokens=${totalTokens}, 记忆=${memoryItems}, 工作区=${workspaceFiles}, ` +
      `工具历史=${toolHistoryItems}, 工件=${artifactItems}`
    );

    return {
      messages: contextMessages,
      totalTokens,
      memoryItems,
      workspaceFiles,
      toolHistoryItems,
      artifactItems,
      systemPromptAdditions,
    };
  }

  private buildMemoryContext(query: string): string | null {
    if (!query || !this.config.memoryQueryRelevance) {
      const recentMemory = this.memoryLayers
        .getAllItems()
        .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
        .slice(0, this.config.maxMemoryItems);

      if (recentMemory.length === 0) return null;

      const items = recentMemory
        .map((m, i) => `${i + 1}. [${m.layer}] ${m.content.slice(0, 200)}`)
        .join('\n');

      return `相关记忆:\n${items}`;
    }

    const results = this.memoryLayers.search({
      query,
      topK: this.config.maxMemoryItems,
    });

    if (results.length === 0) return null;

    const items = results
      .map((m, i) => `${i + 1}. [${m.layer}] ${m.content.slice(0, 200)}`)
      .join('\n');

    return `相关记忆:\n${items}`;
  }

  private buildWorkspaceContext(query: string): string | null {
    const files = query
      ? this.workspaceContext.search({ query, maxResults: this.config.maxWorkspaceFiles })
      : this.workspaceContext.getMostRelevant(this.config.maxWorkspaceFiles);

    if (files.length === 0) return null;

    const fileList = files
      .map((f, i) => `${i + 1}. ${f.path} (${f.size} bytes)`)
      .join('\n');

    return `相关工作区文件:\n${fileList}`;
  }

  private buildToolContext(): string | null {
    const recentCalls = this.toolContext.getRecentCalls(this.config.maxToolHistory);
    if (recentCalls.length === 0) return null;

    const toolList = recentCalls
      .map((call, i) => {
        const status = call.success ? '成功' : '失败';
        return `${i + 1}. ${call.toolName} - ${status} (${call.durationMs}ms)`;
      })
      .join('\n');

    return `最近工具调用:\n${toolList}`;
  }

  private buildArtifactContext(query: string): string | null {
    const artifacts = query
      ? this.artifactStore.search({ limit: this.config.maxArtifactItems })
      : this.artifactStore.search({ limit: this.config.maxArtifactItems });

    if (artifacts.length === 0) return null;

    const artifactList = artifacts
      .map((a, i) => `${i + 1}. [${a.type}] ${a.name}`)
      .join('\n');

    return `相关工件:\n${artifactList}`;
  }

  setConfig(config: Partial<ContextBuilderConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('[ContextBuilder] 配置已更新');
  }

  getConfig(): ContextBuilderConfig {
    return { ...this.config };
  }
}
