/**
 * SecretRedaction 单元测试（10 例）
 *
 * 覆盖模式：
 * 1. OpenAI sk- / sk-proj- 前缀
 * 2. GitHub ghp_ 前缀
 * 3. AWS AKIA 前缀
 * 4. Slack xoxb- / xoxp- 前缀
 * 5. 邮箱地址
 * 6. 信用卡号（Luhn 校验通过）
 * 7. 非 Luhn 数字串不误判为信用卡
 * 8. 中国身份证 18 位
 * 9. 中国手机号 11 位
 * 10. redactObject 递归脱敏
 */

import { describe, it, expect } from 'vitest';
import { redactText, redactObject, Redactor, redactor } from '../secretRedaction.js';

describe('SecretRedaction', () => {
  // 1
  it('脱敏 OpenAI sk- / sk-proj- 前缀', () => {
    const text = 'Using key sk-abcdefghijklmnopqrstuvwxyz1234 in production';
    const result = redactText(text);
    expect(result).toContain('[REDACTED_API_KEY]');
    expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz1234');
  });

  // 2
  it('脱敏 GitHub ghp_ 前缀', () => {
    const text = 'Token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const result = redactText(text);
    expect(result).toContain('[REDACTED_API_KEY]');
    expect(result).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij');
  });

  // 3
  it('脱敏 AWS AKIA Access Key', () => {
    const text = 'aws_access_key_id=AKIAIOSFODNN7EXAMPLE';
    const result = redactText(text);
    expect(result).toContain('[REDACTED_API_KEY]');
    expect(result).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  // 4
  it('脱敏 Slack xoxb- / xoxp- Token', () => {
    const text1 = 'Bot token: xoxb-fake-token-for-testing-only-abc';
    expect(redactText(text1)).toContain('[REDACTED_API_KEY]');

    const text2 = 'User token: xoxp-fake-token-for-testing-only-abc';
    expect(redactText(text2)).toContain('[REDACTED_API_KEY]');
  });

  // 5
  it('脱敏邮箱地址', () => {
    const text = '请联系 user@example.com 或 admin@foo.co.uk 进行处理';
    const result = redactText(text);
    expect(result).not.toContain('user@example.com');
    expect(result).not.toContain('admin@foo.co.uk');
    expect(result).toContain('[REDACTED_EMAIL]');
  });

  // 6
  it('脱敏信用卡号（Luhn 校验通过才替换）', () => {
    const text1 = 'Visa 卡号 4111 1111 1111 1111 已记录';
    expect(redactText(text1)).toContain('[REDACTED_CARD]');

    const text2 = 'Mastercard: 5555555555554444';
    expect(redactText(text2)).toContain('[REDACTED_CARD]');

    const text3 = 'Amex: 378282246310005';
    expect(redactText(text3)).toContain('[REDACTED_CARD]');
  });

  // 7
  it('非 Luhn 有效数字串不误判为信用卡', () => {
    // 1234567890123456 不是 Luhn 有效
    const text = '订单号 1234567890123456 是非法信用卡';
    const result = redactText(text);
    expect(result).not.toContain('[REDACTED_CARD]');
    expect(result).toContain('1234567890123456');
  });

  // 8
  it('脱敏中国身份证 18 位', () => {
    // 11010519491231002X 校验格式：6 位地区码 + 1949-12-31 + 顺序码 + X
    const text = '张三的身份证是 11010519491231002X，请妥善保管';
    const result = redactText(text);
    expect(result).not.toContain('11010519491231002X');
    expect(result).toContain('[REDACTED_ID_CARD]');
  });

  // 9
  it('脱敏中国手机号 11 位', () => {
    const text = '客服电话 13800138000 转 0，工作手机 17612345678';
    const result = redactText(text);
    expect(result).not.toContain('13800138000');
    expect(result).not.toContain('17612345678');
    // "转 0" 中的 0 不是手机号（只有 1 位）
    expect(result).toContain('[REDACTED_PHONE]');
    expect(result.match(/\[REDACTED_PHONE\]/g)?.length).toBe(2);
  });

  // 10
  it('redactObject 递归脱敏字符串字段', () => {
    const input = {
      user: 'alice',
      contact: {
        email: 'alice@example.com',
        phone: '13800138000',
      },
      tokens: [
        'sk-abcdefghijklmnopqrstuvwxyz1234',
        'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij',
      ],
      count: 42,
      ok: true,
      data: null,
    };

    const result = redactObject(input) as typeof input;

    expect(result.user).toBe('alice');
    expect(result.contact.email).toBe('[REDACTED_EMAIL]');
    expect(result.contact.phone).toBe('[REDACTED_PHONE]');
    expect(result.tokens[0]).toBe('[REDACTED_API_KEY]');
    expect(result.tokens[1]).toBe('[REDACTED_API_KEY]');
    // 非字符串保持原样
    expect(result.count).toBe(42);
    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
  });

  // 额外：Redactor 单例与类实例一致性
  it('Redactor 单例与类实例行为一致', () => {
    const r = new Redactor();
    const text = 'contact: user@example.com, sk-abcdefghijklmnopqrstuvwxyz1234';
    expect(r.redact(text)).toBe(redactor.redact(text));
  });
});
