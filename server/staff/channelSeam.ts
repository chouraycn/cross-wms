/**
 * channelSeam — IM 渠道能力缝（P1b：capability seam 三件套）
 *
 * Service Definition（接口声明）：ChannelProvider
 * Service Provider（实现）：wecom / wechat（feishu 待真实推送落地后补充）
 * Consumer（消费方）：deliverToChannel 经注册表分发 —— 换渠道/加渠道不动消费方
 *
 * 注册表在模块加载时注册内置 provider（幂等）；测试可用 clear() 重置。
 * 未注册的渠道（discord/slack/telegram 等）保持 deliverToChannel 原有 demo 记录行为。
 */

import { sendWeComMessage, sendWeComWebhook, probeWeCom } from '../../extensions/wecom/index.js';
import { sendWeChatCustomerMessage, probeWeChat } from '../../extensions/wechat/index.js';
import { sendMessageFeishu } from '../../extensions/feishu/index.js';

// ===================== Service Definition =====================

export interface ChannelSendInput {
  tenantId: string;
  channel: string;
  /** 渠道绑定配置（corp_id/webhook_url/app_id/openid 等，来自 sd_channel_bindings.config_json） */
  config: Record<string, any>;
  toUser?: string;
  content: string;
  /** 投递类型：text / markdown / card / alert（alert 在 text 型渠道按 text 发送） */
  msgtype?: 'text' | 'markdown' | 'card' | 'alert';
}

export interface ChannelSendResult {
  success: boolean;
  messageId?: string | null;
  error?: string | null;
}

/** 渠道 Provider 契约：按渠道实现 send，消费方不感知具体渠道 */
export interface ChannelProvider {
  readonly channel: string;
  send(input: ChannelSendInput): Promise<ChannelSendResult>;
  /** 可选：凭证探测（{ok, error}）。消费方可经注册表统一调用。 */
  probe?(config: Record<string, any>): Promise<{ ok: boolean; error?: string | null }>;
}

// ===================== 注册表 =====================

const providers = new Map<string, ChannelProvider>();

export const channelProviderRegistry = {
  register(provider: ChannelProvider): () => void {
    providers.set(provider.channel, provider);
    return () => {
      if (providers.get(provider.channel) === provider) providers.delete(provider.channel);
    };
  },
  get(channel: string): ChannelProvider | undefined {
    return providers.get(channel);
  },
  list(): string[] {
    return [...providers.keys()];
  },
  /** 测试用：清空注册表 */
  clear(): void {
    providers.clear();
  },
};

/** 消费方分发原语：注册过走 provider，否则返回 null（调用方维持原行为） */
export function dispatchChannelSend(input: ChannelSendInput): Promise<ChannelSendResult> | null {
  const provider = channelProviderRegistry.get(input.channel);
  return provider ? provider.send(input) : null;
}

/** 消费方探测原语：provider 未实现 probe 或未注册返回 null */
export function dispatchChannelProbe(
  channel: string,
  config: Record<string, any>,
): Promise<{ ok: boolean; error?: string | null }> | null {
  const provider = channelProviderRegistry.get(channel);
  return provider?.probe ? provider.probe(config) : null;
}

// ===================== Service Providers =====================

/** 企业微信：群机器人 webhook 优先，其次自建应用消息；无凭证 = demo 成功（与历史行为一致） */
export const wecomChannelProvider: ChannelProvider = {
  channel: 'wecom',
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    const c = input.config;
    const webhookUrl = String(c.webhook_url || '');
    if (webhookUrl) {
      return sendWeComWebhook(webhookUrl, {
        msgtype: input.msgtype === 'markdown' ? 'markdown' : 'text',
        content: input.content,
      });
    }
    const corpId = String(c.corp_id || c.corpId || '');
    const corpSecret = String(c.corp_secret || c.corpSecret || '');
    const agentId = String(c.agent_id || c.bot_id || '');
    if (corpId && corpSecret && agentId) {
      return sendWeComMessage({
        account: {
          corpId,
          corpSecret,
          agentId,
          token: c.token !== undefined ? String(c.token) : undefined,
          encodingAesKey: c.encoding_aes_key !== undefined ? String(c.encoding_aes_key) : undefined,
        },
        toUser: input.toUser,
        msgtype: 'markdown',
        markdown: input.content,
      });
    }
    // 无凭证：demo 记录（与历史行为一致）
    return { success: true, messageId: null, error: null };
  },
  async probe(config: Record<string, any>): Promise<{ ok: boolean; error?: string | null }> {
    return probeWeCom({
      corpId: String(config.corp_id || config.corpId || ''),
      corpSecret: String(config.corp_secret || config.corpSecret || ''),
      agentId: String(config.agent_id || config.bot_id || ''),
      token: config.token !== undefined ? String(config.token) : undefined,
      encodingAesKey: config.encoding_aes_key !== undefined ? String(config.encoding_aes_key) : undefined,
    });
  },
};

/** 微信公众号：客服消息；缺 openid 失败，无凭证 demo 成功 */
export const wechatChannelProvider: ChannelProvider = {
  channel: 'wechat',
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    const c = input.config;
    const appId = String(c.app_id || '');
    const appSecret = String(c.app_secret || '');
    const openid = String(input.toUser || c.openid || '');
    if (appId && appSecret && openid) {
      return sendWeChatCustomerMessage({
        account: { appId, appSecret },
        toUser: openid,
        msgtype: 'text',
        content: input.content,
      });
    }
    if (!openid) {
      return { success: false, messageId: null, error: '公众号投递缺少接收用户 openid（绑定配置 openid 或 toUser）' };
    }
    return { success: true, messageId: null, error: null }; // 无凭证：demo 记录
  },
  async probe(config: Record<string, any>): Promise<{ ok: boolean; error?: string | null }> {
    return probeWeChat({
      appId: String(config.app_id || ''),
      appSecret: String(config.app_secret || ''),
    });
  },
};

/**
 * 飞书：有凭证（app_id + app_secret）且有接收人时真实发送（sendMessageFeishu 失败即抛，
 * 由本 provider 捕获归一化）；缺凭证/接收人时保持历史 demo 行为。
 * 注意：FeishuSendResult 无 success/error 字段（成功即返回），发送异常以 throw 表达。
 */
export const feishuChannelProvider: ChannelProvider = {
  channel: 'feishu',
  async send(input: ChannelSendInput): Promise<ChannelSendResult> {
    const c = input.config;
    const appId = String(c.app_id || c.appId || '');
    const appSecret = String(c.app_secret || c.appSecret || '');
    const to = input.toUser ?? '';
    if (!appId || !appSecret || !to) {
      return { success: true, messageId: null, error: null }; // 缺凭证/接收人：demo 记录（与历史行为一致）
    }
    try {
      const result = await sendMessageFeishu({ cfg: input.config, to, text: input.content });
      return { success: true, messageId: result.messageId ?? null, error: null };
    } catch (err) {
      return { success: false, messageId: null, error: err instanceof Error ? err.message : String(err) };
    }
  },
};

/** 注册内置 provider（幂等：重复注册覆盖同渠道） */
export function registerBuiltinChannelProviders(): void {
  channelProviderRegistry.register(wecomChannelProvider);
  channelProviderRegistry.register(wechatChannelProvider);
  channelProviderRegistry.register(feishuChannelProvider);
}

registerBuiltinChannelProviders();
