// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveBaseHashParam } from '../base-hash.js';

describe('base-hash resolveBaseHashParam', () => {
  it('字符串 baseHash 应返回去除空白后的值', () => {
    expect(resolveBaseHashParam({ baseHash: 'abc123' })).toBe('abc123');
  });

  it('带空白的字符串应去除首尾空白', () => {
    expect(resolveBaseHashParam({ baseHash: '  abc  ' })).toBe('abc');
  });

  it('未提供 baseHash 应返回 null', () => {
    expect(resolveBaseHashParam({})).toBeNull();
  });

  it('非字符串 baseHash 应返回 null', () => {
    expect(resolveBaseHashParam({ baseHash: 123 })).toBeNull();
    expect(resolveBaseHashParam({ baseHash: true })).toBeNull();
    expect(resolveBaseHashParam({ baseHash: null })).toBeNull();
  });

  it('空字符串 baseHash 应返回 null', () => {
    expect(resolveBaseHashParam({ baseHash: '' })).toBeNull();
  });

  it('纯空白字符串 baseHash 应返回 null', () => {
    expect(resolveBaseHashParam({ baseHash: '   ' })).toBeNull();
  });

  it('null 入参应返回 null', () => {
    expect(resolveBaseHashParam(null)).toBeNull();
  });

  it('undefined 入参应返回 null', () => {
    expect(resolveBaseHashParam(undefined)).toBeNull();
  });

  it('缺少 baseHash 字段的对象应返回 null', () => {
    expect(resolveBaseHashParam({ otherField: 'value' })).toBeNull();
  });
});
