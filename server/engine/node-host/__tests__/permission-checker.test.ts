import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { PermissionChecker, createPermissionChecker } from '../permission-checker.js';
import type { Permission } from '../types.js';

describe('node-host/permission-checker', () => {
  let checker: PermissionChecker;

  beforeEach(() => {
    checker = createPermissionChecker();
  });

  describe('默认策略', () => {
    it('默认为 deny 策略', () => {
      const result = checker.check('read', 'file:/tmp/test');
      expect(result.allowed).toBe(false);
    });

    it('可以设置为 allow 策略', () => {
      const c = createPermissionChecker({ defaultEffect: 'allow' });
      const result = c.check('read', 'file:/tmp/test');
      expect(result.allowed).toBe(true);
    });

    it('setDefaultEffect 更改默认策略', () => {
      checker.setDefaultEffect('allow');
      expect(checker.isAllowed('read', 'anything')).toBe(true);
    });
  });

  describe('addPermission & check', () => {
    it('添加 allow 权限后允许访问', () => {
      checker.addPermission({
        action: 'read',
        resource: 'file:/tmp/*',
        effect: 'allow',
      });
      const result = checker.check('read', 'file:/tmp/test');
      expect(result.allowed).toBe(true);
      expect(result.matchedPermission).toBeDefined();
    });

    it('添加 deny 权限后拒绝访问', () => {
      checker.addPermission({
        action: 'write',
        resource: 'file:/etc/*',
        effect: 'deny',
      });
      const result = checker.check('write', 'file:/etc/passwd');
      expect(result.allowed).toBe(false);
    });

    it('后添加的权限优先级更高', () => {
      checker.addPermission({ action: 'read', resource: 'file:*', effect: 'allow' });
      checker.addPermission({ action: 'read', resource: 'file:/secret/*', effect: 'deny' });
      expect(checker.isAllowed('read', 'file:/public/foo')).toBe(true);
      expect(checker.isAllowed('read', 'file:/secret/bar')).toBe(false);
    });
  });

  describe('通配符匹配', () => {
    it('* 匹配所有 action', () => {
      checker.addPermission({ action: '*', resource: 'file:test', effect: 'allow' });
      expect(checker.isAllowed('read', 'file:test')).toBe(true);
      expect(checker.isAllowed('write', 'file:test')).toBe(true);
      expect(checker.isAllowed('delete', 'file:test')).toBe(true);
    });

    it('前缀通配符 *:xxx', () => {
      checker.addPermission({ action: 'read', resource: '*:test.txt', effect: 'allow' });
      expect(checker.isAllowed('read', 'file:test.txt')).toBe(true);
      expect(checker.isAllowed('read', 'http:test.txt')).toBe(true);
    });

    it('后缀通配符 xxx:*', () => {
      checker.addPermission({ action: 'read', resource: 'file:*', effect: 'allow' });
      expect(checker.isAllowed('read', 'file:/tmp/a')).toBe(true);
      expect(checker.isAllowed('read', 'file:/tmp/b/c')).toBe(true);
    });

    it('精确匹配', () => {
      checker.addPermission({ action: 'read', resource: 'file:exact', effect: 'allow' });
      expect(checker.isAllowed('read', 'file:exact')).toBe(true);
      expect(checker.isAllowed('read', 'file:exact2')).toBe(false);
    });
  });

  describe('条件权限', () => {
    it('条件满足时权限生效', () => {
      checker.addPermission({
        action: 'execute',
        resource: 'command:ls',
        effect: 'allow',
        conditions: { userId: 'admin' },
      });
      expect(checker.isAllowed('execute', 'command:ls', { userId: 'admin' })).toBe(true);
      expect(checker.isAllowed('execute', 'command:ls', { userId: 'user' })).toBe(false);
    });

    it('数组条件匹配', () => {
      checker.addPermission({
        action: 'read',
        resource: 'file:*',
        effect: 'allow',
        conditions: { role: ['admin', 'editor'] },
      });
      expect(checker.isAllowed('read', 'file:test', { role: 'admin' })).toBe(true);
      expect(checker.isAllowed('read', 'file:test', { role: 'editor' })).toBe(true);
      expect(checker.isAllowed('read', 'file:test', { role: 'viewer' })).toBe(false);
    });
  });

  describe('批量检查', () => {
    it('checkAll 返回所有结果', () => {
      checker.addPermission({ action: 'read', resource: 'file:*', effect: 'allow' });
      const results = checker.checkAll([
        { action: 'read', resource: 'file:a' },
        { action: 'write', resource: 'file:b' },
      ]);
      expect(results.length).toBe(2);
      expect(results[0].allowed).toBe(true);
      expect(results[1].allowed).toBe(false);
    });

    it('allAllowed 全部允许才为 true', () => {
      checker.addPermission({ action: 'read', resource: '*', effect: 'allow' });
      expect(checker.allAllowed([
        { action: 'read', resource: 'a' },
        { action: 'read', resource: 'b' },
      ])).toBe(true);
      expect(checker.allAllowed([
        { action: 'read', resource: 'a' },
        { action: 'write', resource: 'b' },
      ])).toBe(false);
    });

    it('anyAllowed 任一允许即为 true', () => {
      checker.addPermission({ action: 'read', resource: 'a', effect: 'allow' });
      expect(checker.anyAllowed([
        { action: 'read', resource: 'a' },
        { action: 'write', resource: 'b' },
      ])).toBe(true);
      expect(checker.anyAllowed([
        { action: 'write', resource: 'b' },
        { action: 'delete', resource: 'c' },
      ])).toBe(false);
    });
  });

  describe('管理方法', () => {
    it('addPermissions 批量添加', () => {
      const perms: Permission[] = [
        { action: 'read', resource: 'a', effect: 'allow' },
        { action: 'write', resource: 'b', effect: 'allow' },
      ];
      checker.addPermissions(perms);
      expect(checker.size()).toBe(2);
    });

    it('removePermission 按索引移除', () => {
      checker.addPermission({ action: 'read', resource: 'a', effect: 'allow' });
      checker.addPermission({ action: 'write', resource: 'b', effect: 'allow' });
      expect(checker.removePermission(0)).toBe(true);
      expect(checker.size()).toBe(1);
    });

    it('removePermission 无效索引返回 false', () => {
      expect(checker.removePermission(99)).toBe(false);
    });

    it('clear 清空所有权限', () => {
      checker.addPermission({ action: 'read', resource: 'a', effect: 'allow' });
      checker.clear();
      expect(checker.size()).toBe(0);
    });

    it('getPermissions 返回副本', () => {
      checker.addPermission({ action: 'read', resource: 'a', effect: 'allow' });
      const perms = checker.getPermissions();
      expect(perms.length).toBe(1);
      perms.push({ action: 'x', resource: 'y', effect: 'allow' });
      expect(checker.size()).toBe(1);
    });

    it('getDefaultEffect 返回默认策略', () => {
      expect(checker.getDefaultEffect()).toBe('deny');
    });
  });
});
