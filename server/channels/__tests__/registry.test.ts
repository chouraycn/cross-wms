import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryChannelRegistry } from '../registry.js';
import type { ChannelPlugin } from '../plugin.js';
import type { ChannelId, ChannelMeta } from '../types.js';

function createMockPlugin(id: ChannelId, enabled: boolean = true): ChannelPlugin {
  return {
    id,
    meta: {
      id,
      label: `Test Channel ${id}`,
      selectionLabel: `Test Channel ${id}`,
      blurb: `Test channel ${id} description`,
    } as ChannelMeta,
    capabilities: { chatTypes: ['direct'] },
    config: {
      listAccountIds: () => [],
      resolveAccount: () => null,
      isEnabled: () => enabled,
      isConfigured: () => true,
    },
    message: {
      send: (_ctx: any) => Promise.resolve({ success: true }),
    } as any,
  };
}

describe('Channel Registry 模块单元测试', () => {
  let registry: InMemoryChannelRegistry;

  beforeEach(() => {
    registry = new InMemoryChannelRegistry();
  });

  describe('注册管理', () => {
    it('应该能够注册渠道插件', () => {
      const plugin = createMockPlugin('test-channel');
      registry.register(plugin);

      expect(registry.has('test-channel')).toBe(true);
    });

    it('应该能够取消注册渠道插件', () => {
      const plugin = createMockPlugin('test-channel');
      registry.register(plugin);
      registry.unregister('test-channel');

      expect(registry.has('test-channel')).toBe(false);
    });

    it('应该能够检查渠道是否已注册', () => {
      expect(registry.has('nonexistent')).toBe(false);

      const plugin = createMockPlugin('test-channel');
      registry.register(plugin);
      expect(registry.has('test-channel')).toBe(true);
    });
  });

  describe('渠道查询', () => {
    it('应该能够获取渠道插件', () => {
      const plugin = createMockPlugin('test-channel');
      registry.register(plugin);

      const found = registry.get('test-channel');
      expect(found).toBe(plugin);
    });

    it('获取不存在的渠道应该返回 undefined', () => {
      const found = registry.get('nonexistent');
      expect(found).toBeUndefined();
    });

    it('获取不存在的渠道应该抛出异常', () => {
      expect(() => registry.getOrThrow('nonexistent')).toThrow('Channel plugin not found: nonexistent');
    });

    it('应该能够获取渠道元数据', () => {
      const plugin = createMockPlugin('test-channel');
      registry.register(plugin);

      const meta = registry.getMeta('test-channel');
      expect(meta).toEqual(plugin.meta);
    });

    it('获取不存在的渠道元数据应该返回 undefined', () => {
      const meta = registry.getMeta('nonexistent');
      expect(meta).toBeUndefined();
    });

    it('应该能够按别名查找渠道', () => {
      const plugin = createMockPlugin('test-channel');
      plugin.meta.aliases = ['test-alias', 'test-channel'];
      registry.register(plugin);

      const found = registry.findByAlias('test-alias');
      expect(found).toBe(plugin);
    });
  });

  describe('渠道列表', () => {
    it('应该返回所有已注册渠道', () => {
      const plugin1 = createMockPlugin('channel-1');
      const plugin2 = createMockPlugin('channel-2');
      registry.register(plugin1);
      registry.register(plugin2);

      const all = registry.listAll();
      expect(all).toHaveLength(2);
      expect(all).toContain(plugin1);
      expect(all).toContain(plugin2);
    });

    it('应该返回空数组当没有注册渠道', () => {
      const all = registry.listAll();
      expect(all).toEqual([]);
    });
  });
});