/**
 * 通道 Webhook 路由
 *
 * 提供飞书、企业微信等通道的入站 webhook 端点
 *
 * 路由：
 *   POST /api/webhook/channels/feishu  — 飞书消息回调
 *   POST /api/webhook/channels/wecom   — 企业微信消息回调
 *   GET  /api/webhook/channels/feishu  — 飞书 URL 验证
 *   GET  /api/webhook/channels/wecom   — 企业微信 URL 验证
 */

import { Router, type Request, type Response } from 'express';
import {
  parseFeishuWebhook,
  type FeishuWebhookResult,
} from '../channels/builtin-feishu.js';
import {
  parseWeComWebhook,
  type WeComWebhookResult,
} from '../channels/builtin-wecom.js';
import { logger } from '../logger.js';
import eventBus from '../engine/eventBus.js';

const router: Router = Router();

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
      eventBus.emit('channel:message:received', {
        channel: 'feishu',
        ...result.message,
      });

      logger.info(
        '[ChannelWebhook] 飞书消息已接收:',
        `from=${result.message.userId}`,
        `chat=${result.message.chatId}`,
        `type=${result.message.chatType}`,
      );
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
 * 企业微信消息事件回调
 */
router.post('/wecom', (req: Request, res: Response) => {
  try {
    const account = {
      corpId: process.env.WECOM_CORP_ID || '',
      corpSecret: process.env.WECOM_CORP_SECRET || '',
      agentId: process.env.WECOM_AGENT_ID || '',
      token: process.env.WECOM_TOKEN,
      encodingAesKey: process.env.WECOM_ENCODING_AES_KEY,
    };

    const result: WeComWebhookResult = parseWeComWebhook(req.body, account);

    if (!result.success) {
      logger.warn('[ChannelWebhook] 企业微信 webhook 解析失败:', result.error);
      return res.status(400).send('');
    }

    // 消息事件 - 发布到事件总线
    if (result.type === 'message' && result.message) {
      eventBus.emit('channel:message:received', {
        channel: 'wecom',
        ...result.message,
      });

      logger.info(
        '[ChannelWebhook] 企业微信消息已接收:',
        `from=${result.message.userId}`,
        `chat=${result.message.chatId}`,
        `type=${result.message.chatType}`,
      );
    }

    // 企业微信要求返回空字符串或 success
    res.send('');
  } catch (error) {
    logger.error('[ChannelWebhook] 企业微信 webhook 处理失败:', error);
    res.status(500).send('');
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
 * 企业微信 URL 验证
 */
router.get('/wecom', (req: Request, res: Response) => {
  const echostr = req.query.echostr as string;
  if (echostr) {
    // 企业微信 URL 验证时需要解密并返回 echostr
    // 这里直接返回（简化实现，生产环境应校验签名）
    return res.send(echostr);
  }
  res.status(400).send('');
});

export default router;
