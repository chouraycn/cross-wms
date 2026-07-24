/**
 * types.tools.ts 单元测试
 *
 * types.tools.ts 是兼容性重导出文件，实际逻辑在 ./types/tools.ts。
 * 覆盖：
 * - TOOLS_BY_SENDER_KEY_TYPES：发送者键类型常量
 * - parseToolsBySenderTypedKey：typed 前缀解析、大小写、值保留、边界
 */

import { describe, it, expect } from 'vitest';
import {
  parseToolsBySenderTypedKey,
  TOOLS_BY_SENDER_KEY_TYPES,
} from '../types.tools.js';

describe('TOOLS_BY_SENDER_KEY_TYPES', () => {
  it('包含所有支持的发送者键类型', () => {
    expect(TOOLS_BY_SENDER_KEY_TYPES).toContain('channel');
    expect(TOOLS_BY_SENDER_KEY_TYPES).toContain('id');
    expect(TOOLS_BY_SENDER_KEY_TYPES).toContain('e164');
    expect(TOOLS_BY_SENDER_KEY_TYPES).toContain('username');
    expect(TOOLS_BY_SENDER_KEY_TYPES).toContain('name');
  });

  it('是只读常量数组且长度为 5', () => {
    expect(Array.isArray(TOOLS_BY_SENDER_KEY_TYPES)).toBe(true);
    expect(TOOLS_BY_SENDER_KEY_TYPES).toHaveLength(5);
  });
});

describe('parseToolsBySenderTypedKey', () => {
  it('解析 id: 前缀', () => {
    expect(parseToolsBySenderTypedKey('id:user123')).toEqual({ type: 'id', value: 'user123' });
  });

  it('解析 channel: 前缀（含多段值，保留冒号）', () => {
    expect(parseToolsBySenderTypedKey('channel:slack:U123')).toEqual({
      type: 'channel',
      value: 'slack:U123',
    });
  });

  it('解析 e164: 前缀', () => {
    expect(parseToolsBySenderTypedKey('e164:+15551234567')).toEqual({
      type: 'e164',
      value: '+15551234567',
    });
  });

  it('解析 username: 前缀', () => {
    expect(parseToolsBySenderTypedKey('username:alice')).toEqual({
      type: 'username',
      value: 'alice',
    });
  });

  it('解析 name: 前缀（保留空格）', () => {
    expect(parseToolsBySenderTypedKey('name:Alice Smith')).toEqual({
      type: 'name',
      value: 'Alice Smith',
    });
  });

  it('前缀大小写不敏感（ID: 应解析为 id）', () => {
    expect(parseToolsBySenderTypedKey('ID:user1')).toEqual({ type: 'id', value: 'user1' });
  });

  it('保留值的大小写', () => {
    expect(parseToolsBySenderTypedKey('username:AliCe')).toEqual({
      type: 'username',
      value: 'AliCe',
    });
  });

  it('无前缀的键返回 undefined', () => {
    expect(parseToolsBySenderTypedKey('plainuser')).toBeUndefined();
  });

  it('空字符串与纯空白返回 undefined', () => {
    expect(parseToolsBySenderTypedKey('')).toBeUndefined();
    expect(parseToolsBySenderTypedKey('   ')).toBeUndefined();
  });

  it('仅有前缀冒号但值为空时仍返回空值', () => {
    expect(parseToolsBySenderTypedKey('id:')).toEqual({ type: 'id', value: '' });
  });

  it('对前缀两侧的空白做 trim 处理', () => {
    expect(parseToolsBySenderTypedKey('  id:user  ')).toEqual({ type: 'id', value: 'user' });
  });
});
