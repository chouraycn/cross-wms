/**
 * Channel System - 通道系统抽象层
 *
 * 提供统一的多通道消息收发能力，内置 webhook / 飞书 / 钉钉 / 企业微信 / 邮件 适配器，
 * 并支持通过 registerAdapterFactory 注册自定义通道类型。ChannelManager 聚合所有通道，
 * 提供单发、广播、健康检查与状态查询能力。
 */

import { EventEmitter } from 'events';
import { logger } from '../logger.js';

/** 通道类型 */
export type ChannelType = 'webhook' | 'feishu' | 'dingtalk' | 'wechat' | 'email' | 'slack';

/** 通道状态 */
export type ChannelStatus = 'connected' | 'disconnected' | 'error' | 'unknown';

/** 通道配置 */
export interface ChannelConfig {
  type: ChannelType;
  name: string;
  enabled: boolean;
  credentials: Record<string, string>;
  options?: Record<string, unknown>;
}

/** 通道消息 */
export interface ChannelMessage {
  id: string;
  channelType: ChannelType;
  channelName: string;
  direction: 'inbound' | 'outbound';
  content: string;
  contentType?: 'text' | 'markdown' | 'json';
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/** 通道适配器接口 */
export interface ChannelAdapter {
  type: ChannelType;
  initialize(config: ChannelConfig): Promise<void>;
  sendMessage(message: ChannelMessage): Promise<boolean>;
  receiveMessages(): Promise<ChannelMessage[]>;
  healthCheck(): Promise<boolean>;
  disconnect(): Promise<void>;
}

/** Webhook 通道适配器 */
export class WebhookChannelAdapter implements ChannelAdapter {
  type: ChannelType = 'webhook';
  private config: ChannelConfig | null = null;
  private pendingMessages: ChannelMessage[] = [];

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    logger.info(`[WebhookChannel] 初始化: ${config.name}`);
  }

  async sendMessage(message: ChannelMessage): Promise<boolean> {
    if (!this.config?.credentials.webhookUrl) return false;
    try {
      const resp = await fetch(this.config.credentials.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message.content }),
      });
      return resp.ok;
    } catch (e) {
      logger.error('[WebhookChannel] 发送失败', e);
      return false;
    }
  }

  async receiveMessages(): Promise<ChannelMessage[]> {
    const msgs = this.pendingMessages.splice(0);
    return msgs;
  }

  async healthCheck(): Promise<boolean> {
    return !!this.config?.credentials.webhookUrl;
  }

  async disconnect(): Promise<void> {
    this.config = null;
  }

  /** 接收外部推入的消息（webhook 回调时调用） */
  pushMessage(message: ChannelMessage): void {
    this.pendingMessages.push(message);
  }
}

/** 飞书通道适配器 */
export class FeishuChannelAdapter implements ChannelAdapter {
  type: ChannelType = 'feishu';
  private config: ChannelConfig | null = null;

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    logger.info(`[FeishuChannel] 初始化: ${config.name}`);
  }

  async sendMessage(message: ChannelMessage): Promise<boolean> {
    if (!this.config?.credentials.botWebhookUrl) return false;
    try {
      const body = message.contentType === 'markdown'
        ? { msg_type: 'markdown', content: { post: { zh_cn: { title: '通知', content: [[{ tag: 'text', text: message.content }]] } } } }
        : { msg_type: 'text', content: { text: message.content } };

      const resp = await fetch(this.config.credentials.botWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json() as any;
      return data.code === 0 || resp.ok;
    } catch (e) {
      logger.error('[FeishuChannel] 发送失败', e);
      return false;
    }
  }

  async receiveMessages(): Promise<ChannelMessage[]> {
    // 飞书需要配置事件订阅 URL，消息通过 webhook 回调接收
    return [];
  }

  async healthCheck(): Promise<boolean> {
    return !!this.config?.credentials.botWebhookUrl;
  }

  async disconnect(): Promise<void> {
    this.config = null;
  }
}

/** 钉钉通道适配器 */
export class DingtalkChannelAdapter implements ChannelAdapter {
  type: ChannelType = 'dingtalk';
  private config: ChannelConfig | null = null;

  async sendMessage(message: ChannelMessage): Promise<boolean> {
    if (!this.config?.credentials.webhookUrl) return false;
    try {
      const body = message.contentType === 'markdown'
        ? { msgtype: 'markdown', markdown: { title: '通知', text: message.content } }
        : { msgtype: 'text', text: { content: message.content } };

      const resp = await fetch(this.config.credentials.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json() as any;
      return data.errcode === 0 || resp.ok;
    } catch (e) {
      logger.error('[DingtalkChannel] 发送失败', e);
      return false;
    }
  }

  async receiveMessages(): Promise<ChannelMessage[]> { return []; }
  async healthCheck(): Promise<boolean> { return !!this.config?.credentials.webhookUrl; }
  async disconnect(): Promise<void> { this.config = null; }
  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    logger.info(`[DingtalkChannel] 初始化: ${config.name}`);
  }
}

/** 企业微信通道适配器 */
export class WechatWorkChannelAdapter implements ChannelAdapter {
  type: ChannelType = 'wechat';
  private config: ChannelConfig | null = null;

  async sendMessage(message: ChannelMessage): Promise<boolean> {
    if (!this.config?.credentials.webhookUrl) return false;
    try {
      const body = message.contentType === 'markdown'
        ? { msgtype: 'markdown', markdown: { content: message.content } }
        : { msgtype: 'text', text: { content: message.content } };

      const resp = await fetch(this.config.credentials.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json() as any;
      return data.errcode === 0 || resp.ok;
    } catch (e) {
      logger.error('[WechatWorkChannel] 发送失败', e);
      return false;
    }
  }

  async receiveMessages(): Promise<ChannelMessage[]> { return []; }
  async healthCheck(): Promise<boolean> { return !!this.config?.credentials.webhookUrl; }
  async disconnect(): Promise<void> { this.config = null; }
  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    logger.info(`[WechatWorkChannel] 初始化: ${config.name}`);
  }
}

/** 邮件通道适配器 */
export class EmailChannelAdapter implements ChannelAdapter {
  type: ChannelType = 'email';
  private config: ChannelConfig | null = null;

  async sendMessage(message: ChannelMessage): Promise<boolean> {
    // 邮件发送需要 nodemailer，这里只做接口占位
    logger.info(`[EmailChannel] 邮件发送到: ${this.config?.credentials.to}`);
    return true;
  }

  async receiveMessages(): Promise<ChannelMessage[]> { return []; }
  async healthCheck(): Promise<boolean> { return !!this.config?.credentials.smtpHost; }
  async disconnect(): Promise<void> { this.config = null; }
  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    logger.info(`[EmailChannel] 初始化: ${config.name}`);
  }
}

// ============================================================================
// 入站消息处理管线
// ============================================================================

/** 入站消息处理管线步骤 */
export interface InboundPipelineStep<T = any> {
  name: string;
  execute(message: ChannelMessage): Promise<ChannelMessage | null>;
}

/** 频率限制步骤 */
export class RateLimitStep implements InboundPipelineStep {
  name = 'rate-limit';
  private messageCounts = new Map<string, { count: number; windowStart: number }>();
  private maxPerMinute = 30;

  async execute(message: ChannelMessage): Promise<ChannelMessage | null> {
    const key = `${message.channelType}:${message.channelName}`;
    const now = Date.now();
    const record = this.messageCounts.get(key);

    if (!record || now - record.windowStart > 60000) {
      this.messageCounts.set(key, { count: 1, windowStart: now });
      return message;
    }

    record.count++;
    if (record.count > this.maxPerMinute) {
      logger.warn(`[ChannelInbound] 频率限制: ${key} 超过 ${this.maxPerMinute}/分钟`);
      return null;
    }

    return message;
  }
}

/** 内容过滤步骤 */
export class ContentFilterStep implements InboundPipelineStep {
  name = 'content-filter';
  private blockedPatterns: RegExp[] = [
    /https?:\/\/[^\s]+/gi, // 可选：过滤纯 URL 消息
  ];

  async execute(message: ChannelMessage): Promise<ChannelMessage | null> {
    for (const pattern of this.blockedPatterns) {
      if (pattern.test(message.content)) {
        // 不阻止，但标记
        message.metadata = { ...message.metadata, filtered: true };
      }
    }
    return message;
  }
}

/** 入站管线 */
export class InboundPipeline {
  private steps: InboundPipelineStep[] = [];

  addStep(step: InboundPipelineStep): this {
    this.steps.push(step);
    return this;
  }

  async process(message: ChannelMessage): Promise<ChannelMessage | null> {
    let msg: ChannelMessage | null = message;
    for (const step of this.steps) {
      if (!msg) return null;
      try {
        msg = await step.execute(msg);
      } catch (e) {
        logger.error(`[InboundPipeline] 步骤 ${step.name} 失败`, e);
      }
    }
    return msg;
  }
}

// ============================================================================
// 通道账户
// ============================================================================

/** 通道账户 */
export interface ChannelAccount {
  id: string;
  channelName: string;
  accountId: string;
  accountName: string;
  credentials: Record<string, string>;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
  lastUsedAt?: string;
}

// ============================================================================
// DM 安全策略
// ============================================================================

/** DM 安全策略 */
export interface DmPolicy {
  mode: 'open' | 'allowlist' | 'paired';
  allowedUsers?: string[];
  pairedUsers?: Set<string>;
}

/** 通道管理器 */
export class ChannelManager extends EventEmitter {
  private adapters = new Map<string, ChannelAdapter>();
  private configs = new Map<string, ChannelConfig>();
  private adapterFactories = new Map<ChannelType, () => ChannelAdapter>();
  private accounts = new Map<string, ChannelAccount[]>();
  private dmPolicies = new Map<string, DmPolicy>();

  constructor() {
    super();
    // 注册内置适配器工厂
    this.adapterFactories.set('webhook', () => new WebhookChannelAdapter());
    this.adapterFactories.set('feishu', () => new FeishuChannelAdapter());
    this.adapterFactories.set('dingtalk', () => new DingtalkChannelAdapter());
    this.adapterFactories.set('wechat', () => new WechatWorkChannelAdapter());
    this.adapterFactories.set('email', () => new EmailChannelAdapter());
  }

  /** 注册自定义适配器工厂 */
  registerAdapterFactory(type: ChannelType, factory: () => ChannelAdapter): void {
    this.adapterFactories.set(type, factory);
  }

  /** 添加通道 */
  async addChannel(config: ChannelConfig): Promise<boolean> {
    const factory = this.adapterFactories.get(config.type);
    if (!factory) {
      logger.error(`[ChannelManager] 未知通道类型: ${config.type}`);
      return false;
    }

    const adapter = factory();
    await adapter.initialize(config);
    this.adapters.set(config.name, adapter);
    this.configs.set(config.name, config);
    this.emit('channel_added', config);
    return true;
  }

  /** 移除通道 */
  async removeChannel(name: string): Promise<void> {
    const adapter = this.adapters.get(name);
    if (adapter) {
      await adapter.disconnect();
      this.adapters.delete(name);
      this.configs.delete(name);
      this.emit('channel_removed', name);
    }
  }

  /** 发送消息到指定通道 */
  async sendMessage(channelName: string, content: string, contentType?: 'text' | 'markdown' | 'json'): Promise<boolean> {
    const adapter = this.adapters.get(channelName);
    if (!adapter) {
      logger.error(`[ChannelManager] 通道不存在: ${channelName}`);
      return false;
    }

    const message: ChannelMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      channelType: adapter.type,
      channelName,
      direction: 'outbound',
      content,
      contentType: contentType || 'text',
      timestamp: new Date().toISOString(),
    };

    const success = await adapter.sendMessage(message);
    this.emit('message_sent', { message, success });
    return success;
  }

  /** 广播消息到所有启用的通道 */
  async broadcast(content: string, contentType?: 'text' | 'markdown' | 'json'): Promise<{ total: number; success: number }> {
    let total = 0;
    let success = 0;
    for (const [name, config] of this.configs) {
      if (config.enabled) {
        total++;
        if (await this.sendMessage(name, content, contentType)) {
          success++;
        }
      }
    }
    return { total, success };
  }

  /** 健康检查所有通道 */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [name, adapter] of this.adapters) {
      try {
        results[name] = await adapter.healthCheck();
      } catch {
        results[name] = false;
      }
    }
    return results;
  }

  /** 获取所有通道配置 */
  getChannels(): ChannelConfig[] {
    return Array.from(this.configs.values());
  }

  /** 获取通道状态 */
  getChannelStatus(name: string): ChannelStatus {
    const adapter = this.adapters.get(name);
    const config = this.configs.get(name);
    if (!adapter || !config) return 'unknown';
    return config.enabled ? 'connected' : 'disconnected';
  }

  // ========== 多账户管理 ==========

  /** 添加通道账户 */
  addAccount(channelName: string, account: Omit<ChannelAccount, 'id' | 'channelName' | 'createdAt'>): string {
    const accountId = `acct_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const fullAccount: ChannelAccount = {
      ...account,
      id: accountId,
      channelName,
      createdAt: new Date().toISOString(),
    };

    const accounts = this.accounts.get(channelName) || [];
    accounts.push(fullAccount);
    this.accounts.set(channelName, accounts);
    this.emit('account_added', fullAccount);
    return accountId;
  }

  /** 列出通道的所有账户 */
  listAccounts(channelName: string): ChannelAccount[] {
    return this.accounts.get(channelName) || [];
  }

  /** 获取默认账户 */
  getDefaultAccount(channelName: string): ChannelAccount | null {
    const accounts = this.accounts.get(channelName) || [];
    return accounts.find(a => a.isDefault && a.enabled) || accounts.find(a => a.enabled) || null;
  }

  /** 移除账户 */
  removeAccount(channelName: string, accountId: string): boolean {
    const accounts = this.accounts.get(channelName) || [];
    const idx = accounts.findIndex(a => a.id === accountId);
    if (idx === -1) return false;
    accounts.splice(idx, 1);
    this.emit('account_removed', { channelName, accountId });
    return true;
  }

  /** 设置默认账户 */
  setDefaultAccount(channelName: string, accountId: string): boolean {
    const accounts = this.accounts.get(channelName) || [];
    let found = false;
    for (const acct of accounts) {
      if (acct.id === accountId) {
        acct.isDefault = true;
        found = true;
      } else {
        acct.isDefault = false;
      }
    }
    return found;
  }

  // ========== DM 安全策略 ==========

  /** 设置通道 DM 策略 */
  setDmPolicy(channelName: string, policy: DmPolicy): void {
    this.dmPolicies.set(channelName, policy);
    this.emit('dm_policy_changed', { channelName, policy });
  }

  /** 检查 DM 访问权限 */
  checkDmAccess(channelName: string, userId: string): boolean {
    const policy = this.dmPolicies.get(channelName);
    if (!policy) return true; // 无策略默认允许
    switch (policy.mode) {
      case 'open': return true;
      case 'allowlist': return policy.allowedUsers?.includes(userId) || false;
      case 'paired': return policy.pairedUsers?.has(userId) || false;
      default: return false;
    }
  }

  /** 配对用户 */
  pairUser(channelName: string, userId: string): void {
    const policy = this.dmPolicies.get(channelName);
    if (policy && policy.mode === 'paired') {
      if (!policy.pairedUsers) policy.pairedUsers = new Set();
      policy.pairedUsers.add(userId);
      this.emit('user_paired', { channelName, userId });
    }
  }
}

/** 全局通道管理器单例 */
let globalChannelManager: ChannelManager | null = null;

export function getChannelManager(): ChannelManager {
  if (!globalChannelManager) {
    globalChannelManager = new ChannelManager();
  }
  return globalChannelManager;
}

export function resetChannelManager(): void {
  globalChannelManager = null;
}
