import { logger } from '../../logger.js';

export interface TokenBudgetConfig {
  totalBudget: number;
  systemReserve: number;
  userMessageReserve: number;
  assistantMessageReserve: number;
  toolCallReserve: number;
  memoryReserve: number;
  workspaceReserve: number;
  compactionThreshold: number;
  warningThreshold: number;
  criticalThreshold: number;
  tokensPerCharacter: number;
  tokensPerMessage: number;
  tokensPerToolCall: number;
}

export interface TokenBudgetStats {
  totalBudget: number;
  usedTokens: number;
  remainingTokens: number;
  usagePercent: number;
  systemTokens: number;
  conversationTokens: number;
  memoryTokens: number;
  workspaceTokens: number;
  toolTokens: number;
  status: 'normal' | 'warning' | 'critical';
  lastUpdatedAt: number;
}

export interface TokenAllocation {
  system: number;
  conversation: number;
  memory: number;
  workspace: number;
  tools: number;
}

export interface TokenCostEstimate {
  contentTokens: number;
  overheadTokens: number;
  totalTokens: number;
  breakdown: {
    role: number;
    content: number;
    metadata: number;
    toolCalls: number;
  };
}

const DEFAULT_TOKEN_BUDGET_CONFIG: Required<TokenBudgetConfig> = {
  totalBudget: 128000,
  systemReserve: 4000,
  userMessageReserve: 2000,
  assistantMessageReserve: 4000,
  toolCallReserve: 1000,
  memoryReserve: 8000,
  workspaceReserve: 6000,
  compactionThreshold: 0.85,
  warningThreshold: 0.7,
  criticalThreshold: 0.9,
  tokensPerCharacter: 0.25,
  tokensPerMessage: 4,
  tokensPerToolCall: 15,
};

type BudgetCategory = keyof TokenAllocation;

export class TokenBudgetManager {
  private config: Required<TokenBudgetConfig>;
  private allocations: TokenAllocation;
  private lastUpdatedAt: number = 0;
  private alertListeners: Map<'warning' | 'critical', Array<(stats: TokenBudgetStats) => void>> = new Map();

  constructor(config: Partial<TokenBudgetConfig> = {}) {
    this.config = { ...DEFAULT_TOKEN_BUDGET_CONFIG, ...config };
    this.allocations = {
      system: this.config.systemReserve,
      conversation: 0,
      memory: this.config.memoryReserve,
      workspace: this.config.workspaceReserve,
      tools: 0,
    };
    logger.debug(
      `[TokenBudgetManager] 初始化完成: totalBudget=${this.config.totalBudget} tokens`
    );
  }

  estimateTokens(content: string, role: string = 'user'): TokenCostEstimate {
    const contentTokens = Math.ceil(content.length * this.config.tokensPerCharacter);
    const roleTokens = this.config.tokensPerMessage;
    const metadataTokens = 0;
    const toolCallTokens = 0;
    const overheadTokens = roleTokens + metadataTokens + toolCallTokens;
    const totalTokens = contentTokens + overheadTokens;

    return {
      contentTokens,
      overheadTokens,
      totalTokens,
      breakdown: {
        role: roleTokens,
        content: contentTokens,
        metadata: metadataTokens,
        toolCalls: toolCallTokens,
      },
    };
  }

  estimateMessageTokens(message: {
    role: string;
    content: string;
    toolCalls?: unknown[];
  }): number {
    const estimate = this.estimateTokens(message.content, message.role);
    let toolTokens = 0;
    if (message.toolCalls && message.toolCalls.length > 0) {
      toolTokens = message.toolCalls.length * this.config.tokensPerToolCall;
    }
    return estimate.totalTokens + toolTokens;
  }

  estimateMessagesTokens(messages: Array<{
    role: string;
    content: string;
    toolCalls?: unknown[];
  }>): number {
    return messages.reduce((total, msg) => total + this.estimateMessageTokens(msg), 0);
  }

  addTokens(category: BudgetCategory, tokens: number): boolean {
    const currentTotal = this.getTotalUsed();
    if (currentTotal + tokens > this.config.totalBudget) {
      logger.warn(
        `[TokenBudgetManager] 添加 ${tokens} tokens 到 ${category} 将超出预算 ` +
        `(${currentTotal + tokens}/${this.config.totalBudget})`
      );
      return false;
    }

    this.allocations[category] += tokens;
    this.lastUpdatedAt = Date.now();
    this.checkAndAlert();
    return true;
  }

  removeTokens(category: BudgetCategory, tokens: number): void {
    this.allocations[category] = Math.max(0, this.allocations[category] - tokens);
    this.lastUpdatedAt = Date.now();
  }

  setAllocation(category: BudgetCategory, tokens: number): void {
    this.allocations[category] = Math.max(0, Math.min(tokens, this.config.totalBudget));
    this.lastUpdatedAt = Date.now();
    this.checkAndAlert();
  }

  getTotalUsed(): number {
    return Object.values(this.allocations).reduce((sum, val) => sum + val, 0);
  }

  getRemaining(): number {
    return this.config.totalBudget - this.getTotalUsed();
  }

  getUsagePercent(): number {
    return (this.getTotalUsed() / this.config.totalBudget) * 100;
  }

  getStats(): TokenBudgetStats {
    const used = this.getTotalUsed();
    const usagePercent = (used / this.config.totalBudget) * 100;
    let status: TokenBudgetStats['status'] = 'normal';
    if (usagePercent >= this.config.criticalThreshold * 100) {
      status = 'critical';
    } else if (usagePercent >= this.config.warningThreshold * 100) {
      status = 'warning';
    }

    return {
      totalBudget: this.config.totalBudget,
      usedTokens: used,
      remainingTokens: this.config.totalBudget - used,
      usagePercent,
      systemTokens: this.allocations.system,
      conversationTokens: this.allocations.conversation,
      memoryTokens: this.allocations.memory,
      workspaceTokens: this.allocations.workspace,
      toolTokens: this.allocations.tools,
      status,
      lastUpdatedAt: this.lastUpdatedAt,
    };
  }

  needsCompaction(): boolean {
    return this.getUsagePercent() >= this.config.compactionThreshold * 100;
  }

  getCompactionTarget(): number {
    const targetUsage = this.config.compactionThreshold * 0.7 * this.config.totalBudget;
    const currentUsage = this.getTotalUsed();
    return Math.max(0, currentUsage - targetUsage);
  }

  getAvailableForConversation(): number {
    const reserved =
      this.allocations.system +
      this.allocations.memory +
      this.allocations.workspace +
      this.config.userMessageReserve +
      this.config.assistantMessageReserve;
    return Math.max(0, this.config.totalBudget - reserved - this.allocations.conversation);
  }

  adjustBudget(newBudget: number): void {
    if (newBudget <= 0) {
      throw new Error('预算必须大于 0');
    }
    this.config.totalBudget = newBudget;
    logger.debug(`[TokenBudgetManager] 总预算调整为: ${newBudget} tokens`);
    this.checkAndAlert();
  }

  onAlert(level: 'warning' | 'critical', listener: (stats: TokenBudgetStats) => void): void {
    if (!this.alertListeners.has(level)) {
      this.alertListeners.set(level, []);
    }
    this.alertListeners.get(level)!.push(listener);
  }

  offAlert(level: 'warning' | 'critical', listener: (stats: TokenBudgetStats) => void): void {
    const listeners = this.alertListeners.get(level);
    if (!listeners) return;
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  reset(): void {
    this.allocations = {
      system: this.config.systemReserve,
      conversation: 0,
      memory: this.config.memoryReserve,
      workspace: this.config.workspaceReserve,
      tools: 0,
    };
    this.lastUpdatedAt = Date.now();
    logger.debug('[TokenBudgetManager] 预算已重置');
  }

  private checkAndAlert(): void {
    const stats = this.getStats();
    if (stats.status === 'critical') {
      this.emitAlert('critical', stats);
    } else if (stats.status === 'warning') {
      this.emitAlert('warning', stats);
    }
  }

  private emitAlert(level: 'warning' | 'critical', stats: TokenBudgetStats): void {
    const listeners = this.alertListeners.get(level);
    if (!listeners || listeners.length === 0) return;

    for (const listener of listeners) {
      try {
        listener(stats);
      } catch (err) {
        logger.error(
          `[TokenBudgetManager] 告警监听器执行失败:`,
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  }
}

export function calculateTokenEstimate(text: string): number {
  return Math.ceil(text.length * DEFAULT_TOKEN_BUDGET_CONFIG.tokensPerCharacter);
}
