// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { truncateCloseReason } from '../close-reason.js';

describe('close-reason truncateCloseReason', () => {
  it('空字符串应回退到默认 "invalid handshake"', () => {
    expect(truncateCloseReason('')).toBe('invalid handshake');
  });

  it('短字符串应原样返回', () => {
    expect(truncateCloseReason('protocol error')).toBe('protocol error');
  });

  it('正好等于 maxBytes 的字符串应原样返回', () => {
    const reason = 'a'.repeat(120);
    expect(truncateCloseReason(reason)).toBe(reason);
  });

  it('超过 maxBytes 的字符串应被截断到 120 字节', () => {
    const reason = 'a'.repeat(200);
    const truncated = truncateCloseReason(reason);
    expect(Buffer.byteLength(truncated)).toBe(120);
  });

  it('多字节字符应按字节截断', () => {
    // 中文字符占 3 字节，构造超长字符串
    const reason = '中'.repeat(100); // 300 字节
    const truncated = truncateCloseReason(reason);
    expect(Buffer.byteLength(truncated)).toBeLessThanOrEqual(120);
  });

  it('应支持自定义 maxBytes', () => {
    const reason = 'a'.repeat(50);
    expect(truncateCloseReason(reason, 10)).toBe('aaaaaaaaaa');
  });

  it('自定义 maxBytes 下短字符串应原样返回', () => {
    expect(truncateCloseReason('short', 100)).toBe('short');
  });

  it('自定义 maxBytes=0 时应返回空字符串', () => {
    expect(truncateCloseReason('reason', 0)).toBe('');
  });

  it('默认 maxBytes 应为 120', () => {
    // 通过间接验证：长度为 121 的字符串会被截断到 120
    const reason = 'x'.repeat(121);
    expect(truncateCloseReason(reason)).toHaveLength(120);
  });
});
