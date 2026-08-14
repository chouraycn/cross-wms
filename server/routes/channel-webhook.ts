/**
 * 通道 Webhook 路由
 *
 * 提供飞书、企业微信、微信公众号、钉钉等通道的入站 webhook 端点
 *
 * 路由：
 *   POST /api/webhook/channels/feishu    — 飞书消息回调（JSON）
 *   POST /api/webhook/channels/wecom     — 企业微信消息回调（XML，msg_signature 验签 + AES 解密）
 *   POST /api/webhook/channels/wechat    — 微信公众号消息回调（XML，signature 验签 + AES 解密）
 *   POST /api/webhook/channels/dingtalk  — 钉钉消息/事件回调
 *   GET  /api/webhook/channels/feishu    — 飞书 URL 验证
 *   GET  /api/webhook/channels/wecom     — 企业微信 URL 验证（echostr 验签解密）
 *   GET  /api/webhook/channels/wechat    — 微信公众号 URL 验证（echostr 验签）
 *   GET  /api/webhook/channels/dingtalk  — 钉钉 URL 验证
 *
 * 2026-08-15 真实化：企微/公众号回调走官方算法（签名校验 + AES-256-CBC 解密），
 * 账号配置优先读 StaffDeck 渠道绑定（sd_channel_bindings），env 兜底。
 */

import { Router, type Request, type Response } from 'express';
import express from 'express';
import {
  parseFeishuWebhook,
  type FeishuWebhookResult,
} from '../channels/builtin-feishu.js';
import {
  parseDingTalkWebhook,
  type DingTalkWebhookResult,
} from '../channels/builtin-dingtalk.js';
import { handleWeComCallback } from '../../extensions/wecom/index.js';
import { handleWeChatCallback } from '../../extensions/wechat/index.js';
import { initDb } from '../db.js';
import { logger } from '../logger.js';
import eventBus from '../engine/eventBus.js';

const router: Router = Router();

// 企微/公众号回调为 XML（text/xml），本路由内局部挂 text parser；
// JSON 回调（飞书/钉钉）仍由全局 express.json() 处理（在挂载点之前已解析）。
router.use(express.text({ type: ['text/xml', 'application/xml', 'text/plain'] }));

type Db = ReturnType<typeof initDb>;

function getDb(): Db {
  return initDb() as Db;
}

function parseJson(text: string | null | undefined): Record<string, any> {
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, any>) : {};
  } catch {
    return {};
  }
}

/** 读取最新激活的渠道绑定配置（按 channel） */
function resolveBindingConfig(channel: string): Record<string, any> {
  try {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT config_json FROM sd_channel_bindings WHERE channel = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1",
      )
      .get(channel) as { config_json: string } | undefined;
    if (row) return parseJson(row.config_json);
  } catch (err) {
    logger.warn(`[ChannelWebhook] 读取渠道绑定失败（env 兜底）: ${err instanceof Error ? err.message : String(err)}`);
  }
  return {};
}

/** 解析企业微信账号：DB 绑定优先，env 兜底 */
function resolveWeComAccount(): {
  corpId: string;
  corpSecret: string;
  agentId?: string;
  token?: string;
  encodingAesKey?: string;
} {
  const cfg = resolveBindingConfig('wecom');
  return {
    corpId: String(cfg.corp_id || cfg.corpId || process.env.WECOM_CORP_ID || ''),
    corpSecret: String(cfg.corp_secret || cfg.corpSecret || process.env.WECOM_CORP_SECRET || ''),
    agentId: cfg.agent_id || cfg.bot_id ? String(cfg.agent_id || cfg.bot_id) : process.env.WECOM_AGENT_ID,
    token: cfg.token ? String(cfg.token) : process.env.WECOM_TOKEN,
    encodingAesKey: cfg.encoding_aes_key || cfg.encodingAesKey
      ? String(cfg.encoding_aes_key || cfg.encodingAesKey)
      : process.env.WECOM_ENCODING_AES_KEY,
  };
}

/** 解析微信公众号账号：DB 绑定优先，env 兜底 */
function resolveWeChatAccount(): {
  appId: string;
  appSecret: string;
  token?: string;
  encodingAesKey?: string;
} {
  const cfg = resolveBindingConfig('wechat');
  return {
    appId: String(cfg.app_id || cfg.appId || process.env.WECHAT_APP_ID || ''),
    appSecret: String(cfg.app_secret || cfg.appSecret || process.env.WECHAT_APP_SECRET || ''),
    token: cfg.token ? String(cfg.token) : process.env.WECHAT_TOKEN,
    encodingAesKey: cfg.encoding_aes_key || cfg.encodingAesKey
      ? String(cfg.encoding_aes_key || cfg.encodingAesKey)
      : process.env.WECHAT_ENCODING_AES_KEY,
  };
}

function emitReceived(channel: string, message: { userId: string; chatId: string; messageId: string; text: string; timestamp: number; chatType: string }): void {
  eventBus.emit('channel:message:received', {
    channel,
    ...message,
  });
  logger.info(
    `[ChannelWebhook] ${channel} 消息已接收:`,
    `from=${message.userId}`,
    `chat=${message.chatId}`,
    `type=${message.chatType}`,
  );
}

/**
 * POST /api/webhook/channels/feishu
 * 飞书消息事件回调
 */
router.post('/feishu', (req: Request, res: Response) => {
  try {
    const account = {
      appId: process.env.FEISHU_APP_ID || '',
      appSecret: process.env.FEISHU_APP_SECRET || '',
      verificationToken: process.env.FEISHU_VERIFICATION_TOKEN,
      encryptKey: process.env.FEISHU_ENCRYPT_KEY,
    };

    // URL 验证挑战（飞书会用 POST 发 challenge）
    const body = req.body;
    if (body?.type === 'url_verification' && body?.challenge) {
      return res.json({ challenge: body.challenge });
    }

    const result: FeishuWebhookResult = parseFeishuWebhook(body, account);

    if (!result.success) {
      logger.warn('[ChannelWebhook] 飞书 webhook 解析失败:', result.error);
      return res.status(400).json({ error: result.error });
    }

    // URL 验证类型
    if (result.type === 'url_verification') {
      return res.json({ challenge: body.challenge });
    }

    // 消息事件 - 发布到事件总线
    if (result.type === 'message' && result.message) {
      emitReceived('feishu', result.message);
    }

    // 飞书要求 200 响应，否则会重试
    res.json({ code: 0, msg: 'success' });
  } catch (error) {
    logger.error('[ChannelWebhook] 飞书 webhook 处理失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/webhook/channels/wecom
 * 企业微信消息事件回调（msg_signature 验签 + AES 解密）
 */
router.post('/wecom', (req: Request, res: Response) => {
  try {
    const account = resolveWeComAccount();
    const query = {
      msg_signature: String(req.query.msg_signature ?? ''),
      timestamp: String(req.query.timestamp ?? ''),
      nonce: String(req.query.nonce ?? ''),
    };
    const body = typeof req.body === 'string' ? req.body : (req.body && typeof req.body === 'object' ? (req.body as any).xml ?? '' : '');

    const result = handleWeComCallback(query, body, {
      corpId: account.corpId,
      corpSecret: account.corpSecret,
      agentId: account.agentId,
      token: account.token,
      encodingAesKey: account.encodingAesKey,
    });

    if (!result.success) {
      logger.warn('[ChannelWebhook] 企业微信 webhook 解析失败:', result.error);
      return res.status(400).send('');
    }

    // 消息事件 - 发布到事件总线
    if (result.type === 'message' && result.message) {
      emitReceived('wecom', result.message);
    }

    // 企业微信要求返回空字符串或 success
    res.send('');
  } catch (error) {
    logger.error('[ChannelWebhook] 企业微信 webhook 处理失败:', error);
    res.status(500).send('');
  }
});

/**
 * POST /api/webhook/channels/wechat
 * 微信公众号消息事件回调（signature 验签 + AES 解密）
 */
router.post('/wechat', (req: Request, res: Response) => {
  try {
    const account = resolveWeChatAccount();
    const query = {
      signature: String(req.query.signature ?? ''),
      timestamp: String(req.query.timestamp ?? ''),
      nonce: String(req.query.nonce ?? ''),
      encrypt: String(req.query.encrypt ?? ''),
    };
    const body = typeof req.body === 'string' ? req.body : '';

    const result = handleWeChatCallback(query, body, {
      appId: account.appId,
      appSecret: account.appSecret,
      token: account.token,
      encodingAesKey: account.encodingAesKey,
    });

    if (!result.success) {
      logger.warn('[ChannelWebhook] 微信公众号 webhook 解析失败:', result.error);
      return res.status(400).send('error');
    }

    if (result.type === 'message' && result.message) {
      emitReceived('wechat', result.message);
    }

    // 公众号要求返回 success
    res.send('success');
  } catch (error) {
    logger.error('[ChannelWebhook] 微信公众号 webhook 处理失败:', error);
    res.status(500).send('error');
  }
});

/**
 * GET /api/webhook/channels/feishu
 * 飞书 URL 验证（GET 方式，较少见，兼容备用）
 */
router.get('/feishu', (req: Request, res: Response) => {
  const challenge = req.query.challenge as string;
  if (challenge) {
    return res.json({ challenge });
  }
  res.status(400).json({ error: 'Missing challenge' });
});

/**
 * GET /api/webhook/channels/wecom
 * 企业微信 URL 验证（验签 + 解密 echostr 后原样返回明文）
 */
router.get('/wecom', (req: Request, res: Response) => {
  try {
    const account = resolveWeComAccount();
    const query = {
      msg_signature: String(req.query.msg_signature ?? ''),
      timestamp: String(req.query.timestamp ?? ''),
      nonce: String(req.query.nonce ?? ''),
      echostr: String(req.query.echostr ?? ''),
    };
    const result = handleWeComCallback(query, '', {
      corpId: account.corpId,
      corpSecret: account.corpSecret,
      token: account.token,
      encodingAesKey: account.encodingAesKey,
    });
    if (result.success && result.type === 'url_verification' && result.echostr) {
      return res.send(result.echostr);
    }
    logger.warn('[ChannelWebhook] 企业微信 URL 验证失败:', result.error);
    res.status(400).send('');
  } catch (error) {
    logger.error('[ChannelWebhook] 企业微信 URL 验证异常:', error);
    res.status(400).send('');
  }
});

/**
 * GET /api/webhook/channels/wechat
 * 微信公众号 URL 验证（验签后原样返回 echostr，安全模式先解密）
 */
router.get('/wechat', (req: Request, res: Response) => {
  try {
    const account = resolveWeChatAccount();
    const query = {
      signature: String(req.query.signature ?? ''),
      timestamp: String(req.query.timestamp ?? ''),
      nonce: String(req.query.nonce ?? ''),
      echostr: String(req.query.echostr ?? ''),
    };
    const result = handleWeChatCallback(query, '', {
      appId: account.appId,
      appSecret: account.appSecret,
      token: account.token,
      encodingAesKey: account.encodingAesKey,
    });
    if (result.success && result.type === 'url_verification' && result.echostr) {
      return res.send(result.echostr);
    }
    logger.warn('[ChannelWebhook] 微信公众号 URL 验证失败:', result.error);
    res.status(400).send('error');
  } catch (error) {
    logger.error('[ChannelWebhook] 微信公众号 URL 验证异常:', error);
    res.status(400).send('error');
  }
});

/**
 * POST /api/webhook/channels/dingtalk
 * 钉钉消息/事件回调
 */
router.post('/dingtalk', (req: Request, res: Response) => {
  try {
    const account = {
      appKey: process.env.DINGTALK_APP_KEY || '',
      appSecret: process.env.DINGTALK_APP_SECRET || '',
      token: process.env.DINGTALK_TOKEN,
    };

    const body = (req.body ?? {}) as Record<string, any>;
    const originalMsg = body.msg;

    const result: DingTalkWebhookResult = parseDingTalkWebhook(body, account, {
      signature: req.query.signature as string | undefined,
      timestamp:
        (req.query.timestamp as string | undefined) || (body.timeStamp as string | undefined),
      nonce: (req.query.nonce as string | undefined) || (body.nonce as string | undefined),
    });

    if (!result.success) {
      logger.warn('[ChannelWebhook] 钉钉 webhook 解析失败:', result.error);
      return res.status(400).json({ error: result.error });
    }

    // URL 验证：原样回传 msg
    if (result.type === 'url_verification') {
      const echo = typeof originalMsg === 'string' ? originalMsg : JSON.stringify(originalMsg ?? '');
      return res.json({ msg: echo });
    }

    // 消息事件 - 发布到事件总线
    if (result.type === 'message' && result.message) {
      emitReceived('dingtalk', result.message);
    }

    // 钉钉要求返回 success
    res.json({ success: true });
  } catch (error) {
    logger.error('[ChannelWebhook] 钉钉 webhook 处理失败:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/webhook/channels/dingtalk
 * 钉钉 URL 验证（GET 方式兼容备用）
 */
router.get('/dingtalk', (req: Request, res: Response) => {
  const msg = (req.body?.msg as string | undefined) ?? (req.query.msg as string | undefined);
  if (msg) {
    return res.send(String(msg));
  }
  res.status(400).send('Missing msg');
});

export default router;
