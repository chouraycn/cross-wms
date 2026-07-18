/**
 * 权限控制模块测试
 */

import { describe, it, expect } from 'vitest';
import {
  PermissionChecker,
  buildLeastPrivilege,
  isScopeAllowed,
  getScopePriority,
} from '../permission.js';

describe('权限控制模块', () => {
  describe('PermissionChecker', () => {
    it('grant 后应能通过 check', () => {
      const checker = new PermissionChecker();
      checker.grant({ scope: 'global', actions: ['read'] });
      expect(checker.check('read', 'global')).toBe(true);
    });

    it('未授权的操作应拒绝', () => {
      const checker = new PermissionChecker();
      checker.grant({ scope: 'global', actions: ['read'] });
      expect(checker.check('write', 'global')).toBe(false);
    });

    it('宽作用域应覆盖窄作用域', () => {
      const checker = new PermissionChecker();
      checker.grant({ scope: 'global', actions: ['read'] });
      // global 权限应覆盖 session 作用域
      expect(checker.check('read', 'session', 'sess-1')).toBe(true);
    });

    it('窄作用域不应覆盖宽作用域', () => {
      const checker = new PermissionChecker();
      checker.grant({ scope: 'session', scopeId: 'sess-1', actions: ['read'] });
      // session 权限不应覆盖 global
      expect(checker.check('read', 'global')).toBe(false);
    });

    it('同作用域不同 scopeId 应拒绝', () => {
      const checker = new PermissionChecker();
      checker.grant({ scope: 'session', scopeId: 'sess-1', actions: ['read'] });
      expect(checker.check('read', 'session', 'sess-2')).toBe(false);
    });

    it('revoke 后应拒绝', () => {
      const checker = new PermissionChecker();
      checker.grant({ scope: 'global', actions: ['read'] });
      checker.revoke('global');
      expect(checker.check('read', 'global')).toBe(false);
    });

    it('list 应返回权限快照', () => {
      const checker = new PermissionChecker();
      checker.grant({ scope: 'global', actions: ['read', 'write'] });
      const list = checker.list();
      expect(list).toHaveLength(1);
      expect(list[0].actions).toEqual(['read', 'write']);
    });

    it('provider 限定应生效', () => {
      const checker = new PermissionChecker();
      checker.grant({ scope: 'global', actions: ['read'], provider: 'env' });
      expect(checker.check('read', 'global', undefined, 'env')).toBe(true);
      expect(checker.check('read', 'global', undefined, 'file')).toBe(false);
    });
  });

  describe('buildLeastPrivilege', () => {
    it('应返回单条最小权限', () => {
      const perms = buildLeastPrivilege('session', 'sess-1', ['read']);
      expect(perms).toHaveLength(1);
      expect(perms[0].scope).toBe('session');
      expect(perms[0].scopeId).toBe('sess-1');
      expect(perms[0].actions).toEqual(['read']);
    });
  });

  describe('isScopeAllowed', () => {
    it('请求作用域宽于允许作用域应拒绝', () => {
      // 允许 session（优先级 0），请求 global（优先级 4）
      expect(isScopeAllowed('global', ['session'])).toBe(false);
    });

    it('请求作用域等于允许作用域应通过', () => {
      expect(isScopeAllowed('global', ['global'])).toBe(true);
    });

    it('请求作用域窄于允许作用域应通过', () => {
      // 允许 global（优先级 4），请求 session（优先级 0）
      expect(isScopeAllowed('session', ['global'])).toBe(true);
    });
  });

  describe('getScopePriority', () => {
    it('session 优先级最低（0）', () => {
      expect(getScopePriority('session')).toBe(0);
    });

    it('global 优先级最高（4）', () => {
      expect(getScopePriority('global')).toBe(4);
    });

    it('channel 优先级介于 plugin 与 agent 之间', () => {
      const channel = getScopePriority('channel');
      const plugin = getScopePriority('plugin');
      const agent = getScopePriority('agent');
      expect(channel).toBeGreaterThan(plugin);
      expect(channel).toBeLessThan(agent);
    });
  });
});
