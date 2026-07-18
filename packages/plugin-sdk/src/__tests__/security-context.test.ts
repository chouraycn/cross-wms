/**
 * SecurityContext 契约测试
 *
 * 覆盖安全上下文管理：
 * - 检查权限
 * - 授予权限
 * - 撤销权限
 * - 沙箱执行
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityContext, createSecurityContext } from '../security-context.js';
import type { SecurityContextConfig, Permission, SecurityPolicy } from '../types.js';

describe('SecurityContext Contract', () => {
  function createContext(permissions: Permission[] = [], restrictions: string[] = []): SecurityContext {
    const config: SecurityContextConfig = {
      policy: {
        permissions,
        restrictions,
      },
    };
    return new SecurityContext(config);
  }

  describe('checkPermission', () => {
    it('检查已授权的权限返回 true', () => {
      const ctx = createContext([{ action: 'read' }]);

      expect(ctx.checkPermission('read')).toBe(true);
    });

    it('检查未授权的权限返回 false', () => {
      const ctx = createContext([]);

      expect(ctx.checkPermission('write')).toBe(false);
    });

    it('限制列表中的权限返回 false', () => {
      const ctx = createContext(
        [{ action: 'dangerous' }],
        ['dangerous'],
      );

      expect(ctx.checkPermission('dangerous')).toBe(false);
    });

    it('触发 permission_checked 事件', () => {
      const ctx = createContext([{ action: 'test' }]);
      const handler = vi.fn();
      ctx.on('permission_checked', handler);

      ctx.checkPermission('test');

      expect(handler).toHaveBeenCalledWith('test', true);
    });

    it('带资源检查权限', () => {
      const ctx = createContext([{ action: 'read', resource: 'file1' }]);

      expect(ctx.checkPermission('read', 'file1')).toBe(true);
      expect(ctx.checkPermission('read', 'file2')).toBe(false);
    });

    it('权限检查结果缓存', () => {
      const ctx = createContext([{ action: 'cached' }]);
      const handler = vi.fn();
      ctx.on('permission_checked', handler);

      ctx.checkPermission('cached');
      ctx.checkPermission('cached');

      // 事件只触发一次（因为缓存）
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('grantPermission', () => {
    it('授予权限', () => {
      const ctx = createContext([]);

      ctx.grantPermission('new-perm');

      expect(ctx.checkPermission('new-perm')).toBe(true);
    });

    it('触发 permission_granted 事件', () => {
      const ctx = createContext([]);
      const handler = vi.fn();
      ctx.on('permission_granted', handler);

      ctx.grantPermission('grant-test');

      expect(handler).toHaveBeenCalledWith('grant-test');
    });

    it('重复授予权限不报错', () => {
      const ctx = createContext([{ action: 'existing' }]);

      expect(() => ctx.grantPermission('existing')).not.toThrow();
    });

    it('授予带资源的权限', () => {
      const ctx = createContext([]);

      ctx.grantPermission('resource-perm', 'resource1');

      expect(ctx.checkPermission('resource-perm', 'resource1')).toBe(true);
      expect(ctx.checkPermission('resource-perm', 'resource2')).toBe(false);
    });
  });

  describe('revokePermission', () => {
    it('撤销权限', () => {
      const ctx = createContext([{ action: 'revoke-me' }]);

      ctx.revokePermission('revoke-me');

      expect(ctx.checkPermission('revoke-me')).toBe(false);
    });

    it('触发 permission_revoked 事件', () => {
      const ctx = createContext([{ action: 'revoke-event' }]);
      const handler = vi.fn();
      ctx.on('permission_revoked', handler);

      ctx.revokePermission('revoke-event');

      expect(handler).toHaveBeenCalledWith('revoke-event');
    });

    it('撤销不存在的权限不报错', () => {
      const ctx = createContext([]);

      expect(() => ctx.revokePermission('nonexistent')).not.toThrow();
    });
  });

  describe('sandbox', () => {
    it('在沙箱中执行函数', async () => {
      const ctx = createContext([]);

      const result = await ctx.sandbox(() => 'result');

      expect(result).toBe('result');
    });

    it('触发 sandbox_executed 事件（成功）', async () => {
      const ctx = createContext([]);
      const handler = vi.fn();
      ctx.on('sandbox_executed', handler);

      await ctx.sandbox(() => {});

      expect(handler).toHaveBeenCalledWith(true);
    });

    it('触发 sandbox_executed 事件（失败）', async () => {
      const ctx = createContext([]);
      const handler = vi.fn();
      ctx.on('sandbox_executed', handler);

      try {
        await ctx.sandbox(() => {
          throw new Error('Sandbox error');
        });
      } catch (e) {
        // 预期错误
      }

      expect(handler).toHaveBeenCalledWith(false);
    });

    it('沙箱中抛出的错误被传播', async () => {
      const ctx = createContext([]);

      await expect(
        ctx.sandbox(() => {
          throw new Error('Test error');
        }),
      ).rejects.toThrow('Test error');
    });
  });

  describe('getPolicy', () => {
    it('返回当前策略', () => {
      const ctx = createContext([{ action: 'test' }]);

      const policy = ctx.getPolicy();

      expect(policy.permissions).toHaveLength(1);
      expect(policy.permissions[0].action).toBe('test');
    });
  });

  describe('setPolicy', () => {
    it('更新策略', () => {
      const ctx = createContext([]);

      const newPolicy: SecurityPolicy = {
        permissions: [{ action: 'new-perm' }],
      };

      ctx.setPolicy(newPolicy);

      expect(ctx.checkPermission('new-perm')).toBe(true);
    });

    it('更新策略清除缓存', () => {
      const ctx = createContext([{ action: 'cached-perm' }]);

      ctx.checkPermission('cached-perm');
      ctx.setPolicy({ permissions: [] });

      expect(ctx.checkPermission('cached-perm')).toBe(false);
    });
  });

  describe('getIdentity', () => {
    it('返回身份信息', () => {
      const config: SecurityContextConfig = {
        policy: { permissions: [] },
        identity: {
          userId: 'user-1',
          roles: ['admin'],
          groups: ['dev'],
        },
      };
      const ctx = new SecurityContext(config);

      const identity = ctx.getIdentity();

      expect(identity?.userId).toBe('user-1');
      expect(identity?.roles).toContain('admin');
    });

    it('无身份信息返回 undefined', () => {
      const ctx = createContext([]);

      expect(ctx.getIdentity()).toBeUndefined();
    });
  });

  describe('listPermissions', () => {
    it('列出所有权限', () => {
      const ctx = createContext([
        { action: 'read' },
        { action: 'write' },
      ]);

      const permissions = ctx.listPermissions();

      expect(permissions).toHaveLength(2);
      expect(permissions[0].action).toBe('read');
      expect(permissions[1].action).toBe('write');
    });
  });

  describe('hasAnyPermission', () => {
    it('有权限时返回 true', () => {
      const ctx = createContext([{ action: 'test' }]);

      expect(ctx.hasAnyPermission()).toBe(true);
    });

    it('无权限时返回 false', () => {
      const ctx = createContext([]);

      expect(ctx.hasAnyPermission()).toBe(false);
    });
  });

  describe('createSecurityContext', () => {
    it('工厂函数创建上下文', () => {
      const ctx = createSecurityContext({
        policy: { permissions: [{ action: 'factory' }] },
      });

      expect(ctx.checkPermission('factory')).toBe(true);
    });
  });

  describe('条件检查', () => {
    it('检查角色条件', () => {
      const config: SecurityContextConfig = {
        policy: {
          permissions: [
            {
              action: 'admin-action',
              conditions: { role: 'admin' },
            },
          ],
        },
        identity: {
          roles: ['admin'],
        },
      };
      const ctx = new SecurityContext(config);

      expect(ctx.checkPermission('admin-action')).toBe(true);
    });

    it('检查组条件', () => {
      const config: SecurityContextConfig = {
        policy: {
          permissions: [
            {
              action: 'group-action',
              conditions: { group: 'developers' },
            },
          ],
        },
        identity: {
          groups: ['developers'],
        },
      };
      const ctx = new SecurityContext(config);

      expect(ctx.checkPermission('group-action')).toBe(true);
    });
  });
});