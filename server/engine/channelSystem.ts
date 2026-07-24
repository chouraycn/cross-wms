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
export type ChannelType = 'webhook' | 'feishu' | 'dingtalk' | 'wechat' | 'wechat_work' | 'email';

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
      const data = await resp.json() as { code?: number; errcode?: number };
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

/** 钉钉通道适配器 — 支持群机器人（出站）+ Stream API（入站）双向通信 */
export class DingtalkChannelAdapter implements ChannelAdapter {
  type: ChannelType = 'dingtalk';
  private config: ChannelConfig | null = null;
  private pendingMessages: ChannelMessage[] = [];
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

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
      const data = await resp.json() as { code?: number; errcode?: number };
      return data.errcode === 0 || resp.ok;
    } catch (e) {
      logger.error('[DingtalkChannel] 发送失败', e);
      return false;
    }
  }

  async receiveMessages(): Promise<ChannelMessage[]> {
    const msgs = this.pendingMessages.splice(0);
    return msgs;
  }

  /** 启动钉钉 Stream API 轮询（入站消息） */
  private startStreamPolling(): void {
    const accessToken = this.config?.credentials.accessToken;
    if (!accessToken) return;

    const pollInterval = (this.config?.options?.pollIntervalMs as number) ?? 5000;

    this.pollingTimer = setInterval(async () => {
      try {
        // 钉钉 Stream API：通过 pull 方式获取消息
        const resp = await fetch('https://api.dingtalk.com/v1.0/gateway/connections/open', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-acs-dingtalk-access-token': accessToken,
          },
          body: JSON.stringify({
            clientId: this.config?.credentials.clientId,
            clientSecret: this.config?.credentials.clientSecret,
          }),
        });
        const data = await resp.json() as {
          ok: boolean;
          messages?: Array<{
            msgId: string;
            conversationId: string;
            senderNick: string;
            text?: string;
            createAt: number;
          }>;
        };

        if (!data.ok || !data.messages) return;

        for (const msg of data.messages) {
          if (msg.text) {
            const channelMsg: ChannelMessage = {
              id: `dt_${msg.msgId}`,
              channelType: 'dingtalk',
              channelName: this.config?.name ?? 'dingtalk',
              direction: 'inbound',
              content: msg.text,
              contentType: 'text',
              timestamp: new Date(msg.createAt).toISOString(),
              metadata: {
                conversationId: msg.conversationId,
                senderNick: msg.senderNick,
              },
            };
            this.pendingMessages.push(channelMsg);
          }
        }
      } catch (e) {
        logger.error('[DingtalkChannel] Stream 轮询失败', e);
      }
    }, pollInterval);

    this.pollingTimer.unref?.();
    logger.info(`[DingtalkChannel] Stream 轮询已启动 (间隔 ${pollInterval}ms)`);
  }

  async healthCheck(): Promise<boolean> {
    return !!(this.config?.credentials.webhookUrl || this.config?.credentials.accessToken);
  }

  async disconnect(): Promise<void> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.config = null;
    this.pendingMessages = [];
  }

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    logger.info(`[DingtalkChannel] 初始化: ${config.name}`);

    // 如果配置了 accessToken，启动 Stream 轮询
    if (config.credentials.accessToken && config.options?.autoPoll !== false) {
      this.startStreamPolling();
    }
  }
}

/** 企业微信通道适配器 — 支持群机器人（出站）+ 回调 API（入站）双向通信 */
export class WechatWorkChannelAdapter implements ChannelAdapter {
  type: ChannelType = 'wechat';
  private config: ChannelConfig | null = null;
  private pendingMessages: ChannelMessage[] = [];

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
      const data = await resp.json() as { code?: number; errcode?: number };
      return data.errcode === 0 || resp.ok;
    } catch (e) {
      logger.error('[WechatWorkChannel] 发送失败', e);
      return false;
    }
  }

  async receiveMessages(): Promise<ChannelMessage[]> {
    const msgs = this.pendingMessages.splice(0);
    return msgs;
  }

  /** 接收企业微信回调 API 推入的消息 */
  pushMessage(message: ChannelMessage): void {
    this.pendingMessages.push(message);
  }

  async healthCheck(): Promise<boolean> {
    return !!this.config?.credentials.webhookUrl;
  }

  async disconnect(): Promise<void> {
    this.config = null;
    this.pendingMessages = [];
  }

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    logger.info(`[WechatWorkChannel] 初始化: ${config.name}`);
  }
}

/** 个人微信通道适配器 — 通过第三方网关（如 WeCom/Wechaty）实现双向通信 */
export class WechatPersonalChannelAdapter implements ChannelAdapter {
  type: ChannelType = 'wechat';
  private config: ChannelConfig | null = null;
  private pendingMessages: ChannelMessage[] = [];
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    logger.info(`[WechatPersonalChannel] 初始化: ${config.name}`);

    // 如果配置了网关 URL 和 token，启动轮询
    const gatewayUrl = config.credentials.gatewayUrl;
    const token = config.credentials.token;
    if (gatewayUrl && token && config.options?.autoPoll !== false) {
      this.startGatewayPolling();
    }
  }

  async sendMessage(message: ChannelMessage): Promise<boolean> {
    const gatewayUrl = this.config?.credentials.gatewayUrl;
    const token = this.config?.credentials.token;
    const toUser = this.config?.credentials.toUser ?? this.config?.options?.toUser;

    if (!gatewayUrl || !token || !toUser) return false;

    try {
      const resp = await fetch(`${gatewayUrl}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          toUser,
          content: message.content,
          contentType: message.contentType ?? 'text',
        }),
      });
      const data = await resp.json() as { success: boolean; error?: string };
      if (!data.success) {
        logger.error(`[WechatPersonalChannel] 网关错误: ${data.error}`);
        return false;
      }
      return true;
    } catch (e) {
      logger.error('[WechatPersonalChannel] 发送失败', e);
      return false;
    }
  }

  async receiveMessages(): Promise<ChannelMessage[]> {
    const msgs = this.pendingMessages.splice(0);
    return msgs;
  }

  /** 启动网关消息轮询（入站消息） */
  private startGatewayPolling(): void {
    const gatewayUrl = this.config?.credentials.gatewayUrl;
    const token = this.config?.credentials.token;
    if (!gatewayUrl || !token) return;

    const pollInterval = (this.config?.options?.pollIntervalMs as number) ?? 5000;
    let lastMsgId = '';

    this.pollingTimer = setInterval(async () => {
      try {
        const url = `${gatewayUrl}/receive?lastId=${encodeURIComponent(lastMsgId)}`;
        const resp = await fetch(url, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await resp.json() as {
          success: boolean;
          messages?: Array<{
            id: string;
            fromUser: string;
            content: string;
            timestamp: number;
          }>;
        };

        if (!data.success || !data.messages) return;

        for (const msg of data.messages) {
          if (msg.id === lastMsgId) continue;
          lastMsgId = msg.id;

          const channelMsg: ChannelMessage = {
            id: `wx_${msg.id}`,
            channelType: 'wechat',
            channelName: this.config?.name ?? 'wechat',
            direction: 'inbound',
            content: msg.content,
            contentType: 'text',
            timestamp: new Date(msg.timestamp).toISOString(),
            metadata: {
              fromUser: msg.fromUser,
            },
          };
          this.pendingMessages.push(channelMsg);
        }
      } catch (e) {
        logger.error('[WechatPersonalChannel] 网关轮询失败', e);
      }
    }, pollInterval);

    this.pollingTimer.unref?.();
    logger.info(`[WechatPersonalChannel] 网关轮询已启动 (间隔 ${pollInterval}ms)`);
  }

  async healthCheck(): Promise<boolean> {
    const gatewayUrl = this.config?.credentials.gatewayUrl;
    const token = this.config?.credentials.token;
    if (!gatewayUrl || !token) return false;

    try {
      const resp = await fetch(`${gatewayUrl}/health`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.config = null;
    this.pendingMessages = [];
  }
}

/** 邮件通道适配器（遗留引擎，基于 himalaya CLI；新架构见 server/channels/adapters/email-adapter.ts） */
export class EmailChannelAdapter implements ChannelAdapter {
  type: ChannelType = 'email';
  private config: ChannelConfig | null = null;

  async sendMessage(message: ChannelMessage): Promise<boolean> {
    // 通过 himalaya CLI 发送邮件（国内邮箱 QQ/163/阿里云/腾讯企业邮箱）
    const meta = (message.metadata ?? {}) as { to?: string; subject?: string };
    const to = String(meta.to ?? this.config?.credentials?.to ?? '');
    const subject = String(meta.subject ?? '(无主题)');
    const body = message.content;
    if (!to) {
      logger.warn('[EmailChannel] 未指定收件人，跳过发送');
      return false;
    }
    try {
      const { spawn } = await import('node:child_process');
      const account = String(this.config?.credentials?.himalayaAccount ?? 'default');
      const args = ['-a', account, 'message', 'send', '--to', to, '--subject', subject, '--body', body];
      const result = await new Promise<number>((resolve) => {
        const child = spawn('himalaya', args, { stdio: ['pipe', 'pipe', 'pipe'] });
        child.on('close', resolve);
        child.on('error', () => resolve(1));
        child.stdin?.end();
      });
      if (result === 0) {
        logger.info(`[EmailChannel] 邮件已发送至 ${to}`);
        return true;
      }
      logger.error(`[EmailChannel] himalaya 退出码 ${result}`);
      return false;
    } catch (e) {
      logger.error(`[EmailChannel] 发送失败: ${(e as Error).message}`);
      return false;
    }
  }

  async receiveMessages(): Promise<ChannelMessage[]> { return []; }
  async healthCheck(): Promise<boolean> { return !!this.config?.credentials?.himalayaAccount; }
  async disconnect(): Promise<void> { this.config = null; }
  async initialize(config: ChannelConfig): Promise<void> {
    this.config = config;
    logger.info(`[EmailChannel] 初始化: ${config.name}`);
  }
}

// ============================================================================
// P1-5: IM 通道适配器（微信/企业微信/钉钉双向通信）
// ============================================================================

// 注：Slack/Telegram/Discord 适配器已移除，改为微信/企业微信/钉钉双向通信
// - 微信：通过 WechatPersonalChannelAdapter（第三方网关）实现双向通信
// - 企业微信：通过 WechatWorkChannelAdapter 升级版（群机器人 + 回调 API）实现双向通信
// - 钉钉：通过 DingtalkChannelAdapter 升级版（群机器人 + Stream API）实现双向通信

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
    this.adapterFactories.set('wechat_work', () => new WechatWorkChannelAdapter());
    this.adapterFactories.set('email', () => new EmailChannelAdapter());
    // P1-5: IM 通道（微信/企业微信/钉钉双向通信）
    // 注：Slack/Telegram/Discord 已移除，由微信/企业微信/钉钉替代
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
