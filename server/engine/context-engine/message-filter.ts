import { logger } from '../../logger.js';

export type FilterRuleType = 'keyword' | 'regex' | 'role' | 'length' | 'duplicate' | 'custom';

export interface FilterRule {
  id: string;
  type: FilterRuleType;
  enabled: boolean;
  pattern?: string;
  regexFlags?: string;
  role?: string;
  minLength?: number;
  maxLength?: number;
  action: 'remove' | 'flag' | 'truncate';
  priority: number;
  description?: string;
}

export interface FilterResult {
  filtered: boolean;
  matchedRules: string[];
  action: 'keep' | 'remove' | 'flag' | 'truncate';
  truncatedContent?: string;
  reason?: string;
}

export interface MessageFilterConfig {
  rules: FilterRule[];
  defaultAction: 'keep' | 'remove';
  deduplicate: boolean;
  deduplicateWindow: number;
  removeEmptyMessages: boolean;
}

export interface FilterMessage {
  id: string;
  role: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_CONFIG: MessageFilterConfig = {
  rules: [],
  defaultAction: 'keep',
  deduplicate: true,
  deduplicateWindow: 10,
  removeEmptyMessages: true,
};

export class MessageFilter {
  private config: MessageFilterConfig;
  private recentMessages: Map<string, number> = new Map();

  constructor(config: Partial<MessageFilterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config, rules: [...(config.rules || [])] };
    logger.debug('[MessageFilter] 消息过滤器初始化完成');
  }

  filter(message: FilterMessage): FilterResult {
    if (this.config.removeEmptyMessages && !message.content.trim()) {
      return {
        filtered: true,
        matchedRules: ['empty-message'],
        action: 'remove',
        reason: 'Empty message content',
      };
    }

    const matchedRules: string[] = [];
    let action: FilterResult['action'] = this.config.defaultAction === 'keep' ? 'keep' : 'remove';
    let truncatedContent: string | undefined;

    const sortedRules = [...this.config.rules]
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      const matched = this.matchRule(message, rule);
      if (matched) {
        matchedRules.push(rule.id);

        if (rule.action === 'remove') {
          action = 'remove';
          break;
        } else if (rule.action === 'truncate') {
          action = 'truncate';
          if (rule.maxLength) {
            truncatedContent = this.truncateContent(message.content, rule.maxLength);
          }
        } else if (rule.action === 'flag' && action !== 'truncate') {
          action = 'flag';
        }
      }
    }

    if (this.config.deduplicate) {
      const isDuplicate = this.checkDuplicate(message);
      if (isDuplicate) {
        matchedRules.push('duplicate');
        action = 'remove';
      }
    }

    if (matchedRules.length > 0) {
      logger.debug(
        `[MessageFilter] 消息 ${message.id} 匹配规则: ${matchedRules.join(', ')}, 动作: ${action}`
      );
    }

    return {
      filtered: matchedRules.length > 0,
      matchedRules,
      action,
      truncatedContent,
    };
  }

  filterBatch(messages: FilterMessage[]): {
    kept: FilterMessage[];
    removed: Array<{ message: FilterMessage; reason: string }>;
    flagged: FilterMessage[];
  } {
    const kept: FilterMessage[] = [];
    const removed: Array<{ message: FilterMessage; reason: string }> = [];
    const flagged: FilterMessage[] = [];

    for (const msg of messages) {
      const result = this.filter(msg);

      if (result.action === 'remove') {
        removed.push({ message: msg, reason: result.reason || result.matchedRules.join(', ') });
      } else if (result.action === 'truncate' && result.truncatedContent) {
        kept.push({ ...msg, content: result.truncatedContent });
      } else if (result.action === 'flag') {
        flagged.push(msg);
        kept.push(msg);
      } else {
        kept.push(msg);
      }
    }

    logger.debug(
      `[MessageFilter] 批量过滤: 总数=${messages.length}, ` +
      `保留=${kept.length}, 移除=${removed.length}, 标记=${flagged.length}`
    );

    return { kept, removed, flagged };
  }

  addRule(rule: Omit<FilterRule, 'id'> & { id?: string }): string {
    const id = rule.id || `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newRule: FilterRule = { id, ...rule } as FilterRule;
    this.config.rules.push(newRule);
    logger.debug(`[MessageFilter] 添加过滤规则: ${id} (${rule.type})`);
    return id;
  }

  removeRule(ruleId: string): boolean {
    const index = this.config.rules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;
    this.config.rules.splice(index, 1);
    logger.debug(`[MessageFilter] 移除过滤规则: ${ruleId}`);
    return true;
  }

  enableRule(ruleId: string): boolean {
    const rule = this.config.rules.find(r => r.id === ruleId);
    if (!rule) return false;
    rule.enabled = true;
    return true;
  }

  disableRule(ruleId: string): boolean {
    const rule = this.config.rules.find(r => r.id === ruleId);
    if (!rule) return false;
    rule.enabled = false;
    return true;
  }

  getRules(): FilterRule[] {
    return [...this.config.rules];
  }

  clearRules(): void {
    this.config.rules = [];
    logger.debug('[MessageFilter] 清空所有过滤规则');
  }

  resetDeduplicateCache(): void {
    this.recentMessages.clear();
  }

  private matchRule(message: FilterMessage, rule: FilterRule): boolean {
    switch (rule.type) {
      case 'keyword':
        return this.matchKeyword(message, rule);
      case 'regex':
        return this.matchRegex(message, rule);
      case 'role':
        return this.matchRole(message, rule);
      case 'length':
        return this.matchLength(message, rule);
      case 'custom':
        return true;
      default:
        return false;
    }
  }

  private matchKeyword(message: FilterMessage, rule: FilterRule): boolean {
    if (!rule.pattern) return false;
    return message.content.toLowerCase().includes(rule.pattern.toLowerCase());
  }

  private matchRegex(message: FilterMessage, rule: FilterRule): boolean {
    if (!rule.pattern) return false;
    try {
      const regex = new RegExp(rule.pattern, rule.regexFlags || 'i');
      return regex.test(message.content);
    } catch {
      return false;
    }
  }

  private matchRole(message: FilterMessage, rule: FilterRule): boolean {
    if (!rule.role) return false;
    return message.role.toLowerCase() === rule.role.toLowerCase();
  }

  private matchLength(message: FilterMessage, rule: FilterRule): boolean {
    const length = message.content.length;
    if (rule.minLength !== undefined && length < rule.minLength) return true;
    if (rule.maxLength !== undefined && length > rule.maxLength) return true;
    return false;
  }

  private checkDuplicate(message: FilterMessage): boolean {
    const contentHash = this.hashContent(message.content);
    const now = Date.now();

    for (const [hash, timestamp] of this.recentMessages) {
      if (now - timestamp > 60000) {
        this.recentMessages.delete(hash);
      }
    }

    if (this.recentMessages.has(contentHash)) {
      return true;
    }

    this.recentMessages.set(contentHash, now);
    while (this.recentMessages.size > this.config.deduplicateWindow) {
      const firstKey = this.recentMessages.keys().next().value;
      if (firstKey) {
        this.recentMessages.delete(firstKey);
      }
    }

    return false;
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength - 3) + '...';
  }
}

export function createDefaultFilters(): FilterRule[] {
  return [
    {
      id: 'long-message-truncate',
      type: 'length',
      enabled: true,
      maxLength: 10000,
      action: 'truncate',
      priority: 50,
      description: '截断超长消息',
    },
    {
      id: 'system-keep',
      type: 'role',
      enabled: true,
      role: 'system',
      action: 'flag',
      priority: 100,
      description: '标记系统消息',
    },
  ];
}
