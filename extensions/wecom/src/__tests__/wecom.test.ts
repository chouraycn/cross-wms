/**
 * 企业微信扩展单测：回调加解密（官方算法）+ 回调处理流程
 */
import { describe, it, expect } from 'vitest';
import {
  encryptWeComMessage,
  decryptWeComMessage,
  verifyWeComSignature,
  signWeComEncrypt,
  verifyAndDecryptWeComCallback,
} from '../crypto.js';
import { handleWeComCallback, parseWeComDecrypted } from '../callback.js';

const TOKEN = 'QDG6eK';
const ENCODING_AES_KEY = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'; // 43 位
const RECEIVE_ID = 'ww1234567890';

const TEXT_XML =
  '<xml><ToUserName><![CDATA[ww1234567890]]></ToUserName><FromUserName><![CDATA[zhangsan]]></FromUserName>' +
  '<CreateTime>1409659813</CreateTime><MsgType><![CDATA[text]]></MsgType>' +
  '<Content><![CDATA[你好，企微]]></Content><MsgId>4561255354251565929</MsgId><AgentID>218</AgentID></xml>';

describe('wecom crypto', () => {
  it('加密→解密往返还原消息与 receiveId', () => {
    const cipher = encryptWeComMessage(ENCODING_AES_KEY, TEXT_XML, RECEIVE_ID);
    const { message, receiveId } = decryptWeComMessage(ENCODING_AES_KEY, cipher);
    expect(message).toBe(TEXT_XML);
    expect(receiveId).toBe(RECEIVE_ID);
  });

  it('msg_signature 正确签名通过、篡改失败', () => {
    const encrypt = encryptWeComMessage(ENCODING_AES_KEY, TEXT_XML, RECEIVE_ID);
    const sig = signWeComEncrypt(TOKEN, '1409659589', '263014780', encrypt);
    expect(verifyWeComSignature(TOKEN, '1409659589', '263014780', encrypt, sig)).toBe(true);
    expect(verifyWeComSignature(TOKEN, '1409659589', '263014780', encrypt, 'deadbeef')).toBe(false);
    expect(verifyWeComSignature('WRONG_TOKEN', '1409659589', '263014780', encrypt, sig)).toBe(false);
  });

  it('verifyAndDecryptWeComCallback：完整校验解密；缺配置/签名错拒绝', () => {
    const encrypt = encryptWeComMessage(ENCODING_AES_KEY, TEXT_XML, RECEIVE_ID);
    const sig = signWeComEncrypt(TOKEN, '1409659589', '263014780', encrypt);

    const ok = verifyAndDecryptWeComCallback({
      token: TOKEN,
      encodingAesKey: ENCODING_AES_KEY,
      timestamp: '1409659589',
      nonce: '263014780',
      msgSignature: sig,
      encrypt,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.message).toBe(TEXT_XML);

    const badSig = verifyAndDecryptWeComCallback({
      token: TOKEN,
      encodingAesKey: ENCODING_AES_KEY,
      timestamp: '1409659589',
      nonce: '263014780',
      msgSignature: 'wrong',
      encrypt,
    });
    expect(badSig.ok).toBe(false);

    const noToken = verifyAndDecryptWeComCallback({
      encodingAesKey: ENCODING_AES_KEY,
      timestamp: '1409659589',
      nonce: '263014780',
      msgSignature: sig,
      encrypt,
    });
    expect(noToken.ok).toBe(false);
  });
});

describe('wecom callback', () => {
  const account = { corpId: 'ww1', corpSecret: 's', token: TOKEN, encodingAesKey: ENCODING_AES_KEY };

  it('URL 验证：解密 echostr 并原样返回明文', () => {
    const echostrEncrypted = encryptWeComMessage(ENCODING_AES_KEY, 'hello-echostr', RECEIVE_ID);
    const sig = signWeComEncrypt(TOKEN, '1409659589', '263014780', echostrEncrypted);
    const result = handleWeComCallback(
      { msg_signature: sig, timestamp: '1409659589', nonce: '263014780', echostr: echostrEncrypted },
      '',
      account,
    );
    expect(result.success).toBe(true);
    expect(result.type).toBe('url_verification');
    expect(result.echostr).toBe('hello-echostr');
  });

  it('消息回调：验签 + AES 解密 → 解析出文本消息', () => {
    const encrypt = encryptWeComMessage(ENCODING_AES_KEY, TEXT_XML, RECEIVE_ID);
    const sig = signWeComEncrypt(TOKEN, '1409659589', '263014780', encrypt);
    const result = handleWeComCallback(
      { msg_signature: sig, timestamp: '1409659589', nonce: '263014780' },
      `<xml><ToUserName><![CDATA[ww1234567890]]></ToUserName><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`,
      account,
    );
    expect(result.success).toBe(true);
    expect(result.type).toBe('message');
    expect(result.message?.text).toBe('你好，企微');
    expect(result.message?.userId).toBe('zhangsan');
    expect(result.message?.chatId).toBe('ww1234567890');
    expect(result.message?.chatType).toBe('direct');
  });

  it('消息回调：签名错误拒绝', () => {
    const encrypt = encryptWeComMessage(ENCODING_AES_KEY, TEXT_XML, RECEIVE_ID);
    const result = handleWeComCallback(
      { msg_signature: 'bad', timestamp: '1409659589', nonce: '263014780' },
      `<xml><Encrypt><![CDATA[${encrypt}]]></Encrypt></xml>`,
      account,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('msg_signature');
  });

  it('明文 XML 解析：直接解析文本消息与事件', () => {
    const msg = parseWeComDecrypted(TEXT_XML);
    expect(msg.success).toBe(true);
    expect(msg.message?.text).toBe('你好，企微');

    const eventXml =
      '<xml><ToUserName><![CDATA[ww1]]></ToUserName><FromUserName><![CDATA[zhangsan]]></FromUserName>' +
      '<CreateTime>1409659813</CreateTime><MsgType><![CDATA[event]]></MsgType>' +
      '<Event><![CDATA[subscribe]]></Event></xml>';
    const evt = parseWeComDecrypted(eventXml);
    expect(evt.success).toBe(true);
    expect(evt.type).toBe('event');
    expect(evt.event?.event).toBe('subscribe');
  });
});
