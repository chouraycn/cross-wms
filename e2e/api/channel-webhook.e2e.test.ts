/**
 * 渠道回调 e2e（企业微信/微信公众号官方算法联调）
 *
 * 覆盖链路：官方加密回调（AES-256-CBC + 签名）→ HTTP 端点（/api/webhook/channels/wecom|wechat）
 *   → 验签/解密 → 消息解析 → eventBus 'channel:message:received'
 *
 * 不依赖真实渠道凭证：用测试 Token/EncodingAESKey（env 兜底路径），
 * 加密与签名使用本仓扩展的官方算法实现（encryptWeComMessage 等）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createHash } from 'node:crypto';

// 账号解析走 env 兜底（DB 不可用时）
vi.mock('../../server/db.js', () => ({
  initDb: () => {
    throw new Error('no-db-in-test');
  },
}));
vi.mock('../../server/logger.js', () => ({
  logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
}));

import { encryptWeComMessage, signWeComEncrypt } from '../../extensions/wecom/src/crypto.js';
import { encryptWeChatMessage, signWeChatEncrypt } from '../../extensions/wechat/src/crypto.js';
import channelWebhookRouter from '../../server/routes/channel-webhook.js';
import eventBus from '../../server/engine/eventBus.js';

const WECOM_TOKEN = 'wecomTestToken';
const WECOM_AES = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const WECHAT_TOKEN = 'wechatTestToken';
const WECHAT_AES = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const TS = '1723700000';
const NONCE = '263014780';

const WECOM_TEXT_XML =
  '<xml><ToUserName><![CDATA[ww1234567890]]></ToUserName><FromUserName><![CDATA[zhangsan]]></FromUserName>' +
  `<CreateTime>${TS.slice(0, 10)}</CreateTime><MsgType><![CDATA[text]]></MsgType>` +
  '<Content><![CDATA[企微回调e2e]]></Content><MsgId>4561255354251565929</MsgId><AgentID>218</AgentID></xml>';

const WECHAT_TEXT_XML =
  '<xml><ToUserName><![CDATA[gh_1234567890]]></ToUserName><FromUserName><![CDATA[oia2Tjwmq32VfdAODQpMYA9rLRLz]]></FromUserName>' +
  `<CreateTime>${TS.slice(0, 10)}</CreateTime><MsgType><![CDATA[text]]></MsgType>` +
  '<Content><![CDATA[公众号回调e2e]]></Content><MsgId>4561255354251565929</MsgId></xml>';

function wecomPlainSignature(encrypt: string): string {
  return createHash('sha1').update([WECOM_TOKEN, TS, NONCE, encrypt].sort().join('')).digest('hex');
}
function wechatPlainSignature(): string {
  return createHash('sha1').update([WECHAT_TOKEN, TS, NONCE].sort().join('')).digest('hex');
}
function wechatEncryptedSignature(encrypt: string): string {
  return createHash('sha1').update([WECHAT_TOKEN, TS, NONCE, encrypt].sort().join('')).digest('hex');
}

beforeEach(() => {
  process.env.WECOM_TOKEN = WECOM_TOKEN;
  process.env.WECOM_ENCODING_AES_KEY = WECOM_AES;
  process.env.WECHAT_TOKEN = WECHAT_TOKEN;
  process.env.WECHAT_ENCODING_AES_KEY = WECHAT_AES;
});
afterEach(() => {
  delete process.env.WECOM_TOKEN;
  delete process.env.WECOM_ENCODING_AES_KEY;
  delete process.env.WECHAT_TOKEN;
  delete process.env.WECHAT_ENCODING_AES_KEY;
});

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  app.use('/api/webhook/channels', channelWebhookRouter);
  return app;
}

/** 订阅 eventBus，收集某渠道收到的消息 */
function collectReceived(channel: string): Array<Record<string, unknown>> {
  const received: Array<Record<string, unknown>> = [];
  const handler = (payload: Record<string, unknown>) => {
    if (payload.channel === channel) received.push(payload);
  };
  eventBus.on('channel:message:received', handler);
  const off = () => eventBus.off('channel:message:received', handler);
  return Object.assign(received, { off });
}

describe('渠道回调 e2e（官方算法）', () => {
  it('企微 URL 验证：验签 + 解密 echostr 原样返回明文', async () => {
    const echostr = encryptWeComMessage(WECOM_AES, 'hello-wecom-echostr', 'ww1234567890');
    const sig = wecomPlainSignature(echostr);
    const res = await request(makeApp())
      .get('/api/webhook/channels/wecom')
      .query({ msg_signature: sig, timestamp: TS, nonce: NONCE, echostr });
    expect(res.status).toBe(200);
    expect(res.text).toBe('hello-wecom-echostr');
  });

  it('企微消息回调：验签 + AES 解密 → 解析消息 → eventBus 收到', async () => {
    const encrypt = encryptWeComMessage(WECOM_AES, WECOM_TEXT_XML, 'ww1234567890');
    const sig = wecomPlainSignature(encrypt);
    const received = collectReceived('wecom');
    const res = await request(makeApp())
      .post('/api/webhook/channels/wecom')
      .query({ msg_signature: sig, timestamp: TS, nonce: NONCE })
      .set('Content-Type', 'text/xml')
      .send(`<xml><ToUserName><![CDATA[ww1234567890]]></ToUserName><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`);
    expect(res.status).toBe(200);
    expect(received).toHaveLength(1);
    expect(received[0].text).toBe('企微回调e2e');
    expect(received[0].userId).toBe('zhangsan');
    received.off();
  });

  it('企微消息回调：签名错误返回 400', async () => {
    const encrypt = encryptWeComMessage(WECOM_AES, WECOM_TEXT_XML, 'ww1234567890');
    const res = await request(makeApp())
      .post('/api/webhook/channels/wecom')
      .query({ msg_signature: 'bad', timestamp: TS, nonce: NONCE })
      .set('Content-Type', 'text/xml')
      .send(`<xml><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`);
    expect(res.status).toBe(400);
  });

  it('公众号 URL 验证（明文模式）：验签后原样返回 echostr', async () => {
    const res = await request(makeApp())
      .get('/api/webhook/channels/wechat')
      .query({ signature: wechatPlainSignature(), timestamp: TS, nonce: NONCE, echostr: 'random-echostr-123' });
    expect(res.status).toBe(200);
    expect(res.text).toBe('random-echostr-123');
  });

  it('公众号 URL 验证（安全模式）：解密 echostr 后返回明文', async () => {
    const echostr = encryptWeChatMessage(WECHAT_AES, 'secure-wechat-echostr', 'wx1234567890abcdef');
    const sig = wechatEncryptedSignature(echostr);
    const res = await request(makeApp())
      .get('/api/webhook/channels/wechat')
      .query({ signature: sig, timestamp: TS, nonce: NONCE, echostr });
    expect(res.status).toBe(200);
    expect(res.text).toBe('secure-wechat-echostr');
  });

  it('公众号消息回调（明文模式）：解析 XML → eventBus 收到', async () => {
    const received = collectReceived('wechat');
    const res = await request(makeApp())
      .post('/api/webhook/channels/wechat')
      .query({ signature: wechatPlainSignature(), timestamp: TS, nonce: NONCE })
      .set('Content-Type', 'text/xml')
      .send(WECHAT_TEXT_XML);
    expect(res.status).toBe(200);
    expect(res.text).toBe('success');
    expect(received).toHaveLength(1);
    expect(received[0].text).toBe('公众号回调e2e');
    received.off();
  });

  it('公众号消息回调（安全模式）：验签 + AES 解密 → eventBus 收到', async () => {
    const encrypt = encryptWeChatMessage(WECHAT_AES, WECHAT_TEXT_XML, 'wx1234567890abcdef');
    const sig = wechatEncryptedSignature(encrypt);
    const received = collectReceived('wechat');
    const res = await request(makeApp())
      .post('/api/webhook/channels/wechat')
      .query({ signature: sig, timestamp: TS, nonce: NONCE })
      .set('Content-Type', 'text/xml')
      .send(`<xml><ToUserName><![CDATA[gh_1234567890]]></ToUserName><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`);
    expect(res.status).toBe(200);
    expect(res.text).toBe('success');
    expect(received).toHaveLength(1);
    expect(received[0].text).toBe('公众号回调e2e');
    received.off();
  });

  it('公众号消息回调：签名错误返回非 200', async () => {
    const res = await request(makeApp())
      .post('/api/webhook/channels/wechat')
      .query({ signature: 'bad', timestamp: TS, nonce: NONCE })
      .set('Content-Type', 'text/xml')
      .send(WECHAT_TEXT_XML);
    expect(res.status).toBe(400);
  });
});
