import { describe, it, expect, beforeEach } from 'vitest';
import { AllowlistManager } from '../access/allowlist.js';
import type { ChannelIngressIdentifier } from '../access/types.js';

function createIdentifier(kind: string, value: string): ChannelIngressIdentifier {
  return { kind, value };
}

describe('AllowlistManager 模块单元测试', () => {
  let manager: AllowlistManager;

  beforeEach(() => {
    manager = new AllowlistManager();
  });

  describe('允许列表检查', () => {
    it('应该检查标识符是否在允许列表中', () => {
      const identifier = createIdentifier('user', 'test-user');
      manager.add(identifier, 'dm');

      expect(manager.isAllowed(identifier, 'dm')).toBe(true);
      expect(manager.isAllowed(identifier, 'group')).toBe(false);
    });

    it('应该检查多个标识符中是否有任何一个在允许列表中', () => {
      const id1 = createIdentifier('user', 'user1');
      const id2 = createIdentifier('user', 'user2');
      const id3 = createIdentifier('user', 'user3');

      manager.add(id1, 'dm');

      expect(manager.isAnyAllowed([id1, id2], 'dm')).toBe(true);
      expect(manager.isAnyAllowed([id2, id3], 'dm')).toBe(false);
    });

    it('应该返回 false 当允许列表为空', () => {
      const identifier = createIdentifier('user', 'test-user');
      expect(manager.isAllowed(identifier, 'dm')).toBe(false);
    });
  });

  describe('允许列表管理', () => {
    it('应该能够添加标识符到允许列表', () => {
      const identifier = createIdentifier('user', 'test-user');
      manager.add(identifier, 'dm');

      expect(manager.isAllowed(identifier, 'dm')).toBe(true);
    });

    it('添加重复标识符应该不会产生重复项', () => {
      const identifier = createIdentifier('user', 'test-user');
      manager.add(identifier, 'dm');
      manager.add(identifier, 'dm');

      expect(manager.isAllowed(identifier, 'dm')).toBe(true);
    });

    it('应该能够从允许列表中移除标识符', () => {
      const identifier = createIdentifier('user', 'test-user');
      manager.add(identifier, 'dm');
      manager.remove(identifier, 'dm');

      expect(manager.isAllowed(identifier, 'dm')).toBe(false);
    });

    it('移除不存在的标识符应该不报错', () => {
      const identifier = createIdentifier('user', 'test-user');
      expect(() => manager.remove(identifier, 'dm')).not.toThrow();
    });
  });

  describe('配置加载', () => {
    it('应该能够从配置加载允许列表', () => {
      const config = {
        channels: {
          'test-channel': {
            allowlist: {
              dm: [{ kind: 'user', value: 'user1' }, { kind: 'user', value: 'user2' }],
              group: [{ kind: 'group', value: 'group1' }],
            },
          },
        },
      };

      manager.loadFromConfig(config as any, 'test-channel');

      expect(manager.isAllowed({ kind: 'user', value: 'user1' }, 'dm')).toBe(true);
      expect(manager.isAllowed({ kind: 'user', value: 'user2' }, 'dm')).toBe(true);
      expect(manager.isAllowed({ kind: 'group', value: 'group1' }, 'group')).toBe(true);
    });

    it('加载配置应该重置之前的允许列表', () => {
      const identifier = createIdentifier('user', 'old-user');
      manager.add(identifier, 'dm');

      const config = {
        channels: {
          'test-channel': {
            allowlist: { dm: [], group: [] },
          },
        },
      };

      manager.loadFromConfig(config as any, 'test-channel');

      expect(manager.isAllowed(identifier, 'dm')).toBe(false);
    });
  });
});