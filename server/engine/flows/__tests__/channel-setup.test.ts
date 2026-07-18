/**
 * channel-setup 测试
 */

import { describe, it, expect, vi } from 'vitest';
import {
  groupChannelOptionsByCategory,
} from '../channel-setup.js';
import type { ChannelSetupOption } from '../channel-setup.js';

const { loggerMock } = vi.hoisted(() => {
  const loggerMock = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { loggerMock };
});

vi.mock('../../../logger.js', () => ({ logger: loggerMock }));

const makeOption = (
  channelId: string,
  enabled: boolean,
  configured: boolean,
): ChannelSetupOption => ({
  value: channelId,
  label: `渠道 ${channelId}`,
  channelId,
  enabled,
  configured,
  hint: configured ? '已配置' : '未配置',
});

describe('channel-setup 工具函数', () => {
  describe('groupChannelOptionsByCategory', () => {
    it('所有选项归为 other 分组', () => {
      const options: ChannelSetupOption[] = [
        makeOption('wechat', true, true),
        makeOption('dingtalk', true, false),
        makeOption('webhook', true, true),
      ];
      const groups = groupChannelOptionsByCategory(options);
      expect(Object.keys(groups)).toEqual(['other']);
      expect(groups['other']).toHaveLength(3);
    });

    it('空数组返回空对象', () => {
      expect(groupChannelOptionsByCategory([])).toEqual({});
    });

    it('保持组内顺序', () => {
      const options: ChannelSetupOption[] = [
        makeOption('b', true, true),
        makeOption('a', true, true),
        makeOption('c', true, true),
      ];
      const groups = groupChannelOptionsByCategory(options);
      expect(groups['other'].map((o) => o.channelId)).toEqual(['b', 'a', 'c']);
    });
  });
});
