// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sanitizeChatSendMessageInput } from '../chat-input-sanitize.js';

describe('chat-input-sanitize sanitizeChatSendMessageInput', () => {
  it('普通文本应原样返回（NFC 规范化后）', () => {
    const result = sanitizeChatSendMessageInput('hello world');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('hello world');
    }
  });

  it('包含 null 字节应拒绝', () => {
    const result = sanitizeChatSendMessageInput('hello\u0000world');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('null bytes');
    }
  });

  it('应保留制表符 \\t', () => {
    const result = sanitizeChatSendMessageInput('a\tb');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('a\tb');
    }
  });

  it('应保留换行符 \\n', () => {
    const result = sanitizeChatSendMessageInput('line1\nline2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('line1\nline2');
    }
  });

  it('应保留回车符 \\r', () => {
    const result = sanitizeChatSendMessageInput('a\rb');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('a\rb');
    }
  });

  it('应剥离其他控制字符（如 \\u0001）', () => {
    const result = sanitizeChatSendMessageInput('a\u0001b');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('ab');
    }
  });

  it('应剥离 DEL 字符 (\\u007f)', () => {
    const result = sanitizeChatSendMessageInput('a\u007fb');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('ab');
    }
  });

  it('应保留可见 ASCII 字符', () => {
    const result = sanitizeChatSendMessageInput('ABCdef123!@#');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('ABCdef123!@#');
    }
  });

  it('应保留 Unicode 文本（如中文）', () => {
    const result = sanitizeChatSendMessageInput('你好，世界');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('你好，世界');
    }
  });

  it('空字符串应原样返回', () => {
    const result = sanitizeChatSendMessageInput('');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('');
    }
  });

  it('组合字符应被 NFC 规范化', () => {
    // é 可以是单个字符 U+00E9 或 e + U+0301 组合，NFC 后应为单字符
    const combined = 'e\u0301';
    const result = sanitizeChatSendMessageInput(combined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.message).toBe('é');
      expect(result.message.length).toBe(1);
    }
  });
});
