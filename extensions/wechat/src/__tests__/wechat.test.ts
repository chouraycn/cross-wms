/**
 * 微信公众号扩展单测：回调加解密（官方算法）+ 回调处理流程
 */
import { describe, it, expect } from 'vitest';
import {
  encryptWeChatMessage,
  decryptWeChatMessage,
  verifyWeChatSignature,
  signWeChatEncrypt,
} from '../crypto.js';
import { handleWeChatCallback, parseWeChatDecrypted } from '../callback.js';

const TOKEN = 'testToken123';
const ENCODING_AES_KEY = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'; // 43 位
const APP_ID = 'wx1234567890abcdef';

const TEXT_XML =
  '<xml><ToUserName><![CDATA[gh_1234567890]]></ToUserName><FromUserName><![CDATA[oia2Tjwmq32VfdAODQpMYA9rLRLz]]></FromUserName>' +
  '<CreateTime>1409659813</CreateTime><MsgType><![CDATA[text]]></MsgType>' +
  '<Content><![CDATA[你好，公众号]]></Content><MsgId>4561255354251565929</MsgId></xml>';

describe('wechat crypto', () => {
  it('加密→解密往返还原消息与 appId', () => {
    const cipher = encryptWeChatMessage(ENCODING_AES_KEY, TEXT_XML, APP_ID);
    const { message, appId } = decryptWeChatMessage(ENCODING_AES_KEY, cipher);
    expect(message).toBe(TEXT_XML);
    expect(appId).toBe(APP_ID);
  });

  it('明文模式验签：sha1(sort(token,timestamp,nonce))', () => {
    expect(verifyWeChatSignature(TOKEN, '1409659589', '263014780', 'dummy', undefined)).toBe(false);
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const expected = createHash('sha1')
      .update(['1409659589', '263014780', TOKEN].sort().join(''))
      .digest('hex');
    expect(verifyWeChatSignature(TOKEN, '1409659589', '263014780', expected, undefined)).toBe(true);
  });

  it('安全模式验签：sha1(sort(token,timestamp,nonce,encrypt))', () => {
    const encrypt = encryptWeChatMessage(ENCODING_AES_KEY, TEXT_XML, APP_ID);
    const sig = signWeChatEncrypt(TOKEN, '1409659589', '263014780', encrypt);
    expect(verifyWeChatSignature(TOKEN, '1409659589', '263014780', sig, encrypt)).toBe(true);
    expect(verifyWeChatSignature(TOKEN, '1409659589', '263014780', 'bad', encrypt)).toBe(false);
  });
});

describe('wechat callback', () => {
  const account = { appId: APP_ID, appSecret: 's', token: TOKEN, encodingAesKey: ENCODING_AES_KEY };

  it('URL 验证（明文模式）：验签后原样返回 echostr', () => {
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const sig = createHash('sha1').update(['1409659589', '263014780', TOKEN].sort().join('')).digest('hex');
    const result = handleWeChatCallback(
      { signature: sig, timestamp: '1409659589', nonce: '263014780', echostr: 'random-echostr-123' },
      '',
      account,
    );
    expect(result.success).toBe(true);
    expect(result.type).toBe('url_verification');
    expect(result.echostr).toBe('random-echostr-123');
  });

  it('URL 验证（安全模式）：解密 echostr 后返回明文', () => {
    const echostrEncrypted = encryptWeChatMessage(ENCODING_AES_KEY, 'secure-echostr', APP_ID);
    const sig = signWeChatEncrypt(TOKEN, '1409659589', '263014780', echostrEncrypted);
    const result = handleWeChatCallback(
      { signature: sig, timestamp: '1409659589', nonce: '263014780', echostr: echostrEncrypted },
      '',
      account,
    );
    expect(result.success).toBe(true);
    expect(result.echostr).toBe('secure-echostr');
  });

  it('消息回调（明文模式）：直接解析 XML 文本消息', () => {
    const { createHash } = require('node:crypto') as typeof import('node:crypto');
    const sig = createHash('sha1').update(['1409659589', '263014780', TOKEN].sort().join('')).digest('hex');
    const result = handleWeChatCallback(
      { signature: sig, timestamp: '1409659589', nonce: '263014780' },
      TEXT_XML,
      account,
    );
    expect(result.success).toBe(true);
    expect(result.message?.text).toBe('你好，公众号');
    expect(result.message?.userId).toBe('oia2Tjwmq32VfdAODQpMYA9rLRLz');
    expect(result.message?.chatType).toBe('direct');
  });

  it('消息回调（安全模式）：验签 + AES 解密 → 解析出文本消息', () => {
    const encrypt = encryptWeChatMessage(ENCODING_AES_KEY, TEXT_XML, APP_ID);
    const sig = signWeChatEncrypt(TOKEN, '1409659589', '263014780', encrypt);
    const result = handleWeChatCallback(
      { signature: sig, timestamp: '1409659589', nonce: '263014780' },
      `<xml><ToUserName><![CDATA[gh_1234567890]]></ToUserName><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`,
      account,
    );
    expect(result.success).toBe(true);
    expect(result.message?.text).toBe('你好，公众号');
    expect(result.message?.messageId).toBe('4561255354251565929');
  });

  it('消息回调：签名错误拒绝', () => {
    const result = handleWeChatCallback(
      { signature: 'bad', timestamp: '1409659589', nonce: '263014780' },
      TEXT_XML,
      account,
    );
    expect(result.success).toBe(false);
  });

  it('明文 XML 解析：事件与文本', () => {
    const evtXml =
      '<xml><ToUserName><![CDATA[gh_1]]></ToUserName><FromUserName><![CDATA[oia2Tjwmq32]]></FromUserName>' +
      '<CreateTime>1409659813</CreateTime><MsgType><![CDATA[event]]></MsgType><Event><![CDATA[subscribe]]></Event></xml>';
    const evt = parseWeChatDecrypted(evtXml);
    expect(evt.success).toBe(true);
    expect(evt.type).toBe('event');
    expect(evt.event?.event).toBe('subscribe');
  });
});
