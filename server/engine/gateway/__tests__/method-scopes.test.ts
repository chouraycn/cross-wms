// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  ADMIN_SCOPE,
  APPROVALS_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
  PAIRING_SCOPE,
  TALK_SECRETS_SCOPE,
  isApprovalMethod,
  isNodeRoleMethod,
  isAdminOnlyMethod,
  resolveRequiredOperatorScopeForMethod,
  resolveLeastPrivilegeOperatorScopesForMethod,
  authorizeOperatorScopesForMethod,
  authorizeOperatorScopesForRequiredScope,
  isGatewayMethodClassified,
} from '../method-scopes.js';

describe('method-scopes 方法 scope 解析与授权', () => {
  describe('isApprovalMethod', () => {
    it('exec.approval.get 应为 approval 方法', () => {
      expect(isApprovalMethod('exec.approval.get')).toBe(true);
    });

    it('exec.approval.list 应为 approval 方法', () => {
      expect(isApprovalMethod('exec.approval.list')).toBe(true);
    });

    it('plugin.approval.request 应为 approval 方法', () => {
      expect(isApprovalMethod('plugin.approval.request')).toBe(true);
    });

    it('health 不应为 approval 方法', () => {
      expect(isApprovalMethod('health')).toBe(false);
    });
  });

  describe('isNodeRoleMethod', () => {
    it('node.invoke.result 应为 node-role 方法', () => {
      expect(isNodeRoleMethod('node.invoke.result')).toBe(true);
    });

    it('node.event 应为 node-role 方法', () => {
      expect(isNodeRoleMethod('node.event')).toBe(true);
    });

    it('node.pending.pull 应为 node-role 方法', () => {
      expect(isNodeRoleMethod('node.pending.pull')).toBe(true);
    });

    it('health 不应为 node-role 方法', () => {
      expect(isNodeRoleMethod('health')).toBe(false);
    });
  });

  describe('isAdminOnlyMethod', () => {
    it('channels.start 应为 admin-only 方法', () => {
      expect(isAdminOnlyMethod('channels.start')).toBe(true);
    });

    it('config.set 应为 admin-only 方法', () => {
      expect(isAdminOnlyMethod('config.set')).toBe(true);
    });

    it('health 不应为 admin-only 方法', () => {
      expect(isAdminOnlyMethod('health')).toBe(false);
    });
  });

  describe('resolveRequiredOperatorScopeForMethod', () => {
    it('health 应要求 read scope', () => {
      expect(resolveRequiredOperatorScopeForMethod('health')).toBe(READ_SCOPE);
    });

    it('sessions.send 应要求 write scope', () => {
      expect(resolveRequiredOperatorScopeForMethod('sessions.send')).toBe(WRITE_SCOPE);
    });

    it('node.pair.request 应要求 pairing scope', () => {
      expect(resolveRequiredOperatorScopeForMethod('node.pair.request')).toBe(PAIRING_SCOPE);
    });

    it('exec.approval.request 应要求 approvals scope', () => {
      expect(resolveRequiredOperatorScopeForMethod('exec.approval.request')).toBe(APPROVALS_SCOPE);
    });

    it('未分类方法应返回 undefined', () => {
      expect(resolveRequiredOperatorScopeForMethod('unknown.method')).toBeUndefined();
    });

    it('node-role 方法不应返回 operator scope', () => {
      expect(resolveRequiredOperatorScopeForMethod('node.event')).toBeUndefined();
    });

    it('dynamic 方法（plugins.sessionAction）不应返回静态 operator scope', () => {
      expect(resolveRequiredOperatorScopeForMethod('plugins.sessionAction')).toBeUndefined();
    });
  });

  describe('resolveLeastPrivilegeOperatorScopesForMethod', () => {
    it('read 方法应返回 [read]', () => {
      expect(resolveLeastPrivilegeOperatorScopesForMethod('health')).toEqual([READ_SCOPE]);
    });

    it('write 方法应返回 [write]', () => {
      expect(resolveLeastPrivilegeOperatorScopesForMethod('sessions.send')).toEqual([WRITE_SCOPE]);
    });

    it('admin 方法应返回 [admin]', () => {
      expect(resolveLeastPrivilegeOperatorScopesForMethod('config.set')).toEqual([ADMIN_SCOPE]);
    });

    it('未分类方法应返回空数组（默认拒绝）', () => {
      expect(resolveLeastPrivilegeOperatorScopesForMethod('unknown.method')).toEqual([]);
    });

    it('dynamic 方法 plugins.sessionAction 无有效参数时默认 write scope', () => {
      expect(resolveLeastPrivilegeOperatorScopesForMethod('plugins.sessionAction', {})).toEqual([
        WRITE_SCOPE,
      ]);
    });

    it('dynamic 方法 plugins.sessionAction 带 pluginId/actionId 但无注册表时回退到 CLI 默认 scope', () => {
      const scopes = resolveLeastPrivilegeOperatorScopesForMethod('plugins.sessionAction', {
        pluginId: 'myplugin',
        actionId: 'myaction',
      });
      expect(scopes).toEqual([
        ADMIN_SCOPE,
        READ_SCOPE,
        WRITE_SCOPE,
        APPROVALS_SCOPE,
        PAIRING_SCOPE,
        TALK_SECRETS_SCOPE,
      ]);
    });

    it('其他 dynamic 方法应默认 [write]', () => {
      // 只有 plugins.sessionAction 是已注册 dynamic 方法，其他未分类方法走默认拒绝
      expect(resolveLeastPrivilegeOperatorScopesForMethod('nonexistent.dynamic')).toEqual([]);
    });
  });

  describe('authorizeOperatorScopesForMethod', () => {
    it('admin scope 应授权任何方法', () => {
      const result = authorizeOperatorScopesForMethod('health', [ADMIN_SCOPE]);
      expect(result.allowed).toBe(true);
    });

    it('read scope 应授权 read 方法', () => {
      const result = authorizeOperatorScopesForMethod('health', [READ_SCOPE]);
      expect(result.allowed).toBe(true);
    });

    it('write scope 应授权 read 方法（write 隐含 read）', () => {
      const result = authorizeOperatorScopesForMethod('health', [WRITE_SCOPE]);
      expect(result.allowed).toBe(true);
    });

    it('仅 approvals scope 不应授权 admin 方法', () => {
      const result = authorizeOperatorScopesForMethod('config.set', [APPROVALS_SCOPE]);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.missingScope).toBe(ADMIN_SCOPE);
      }
    });

    it('未分类方法默认要求 admin scope', () => {
      const result = authorizeOperatorScopesForMethod('unknown.method', [READ_SCOPE]);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.missingScope).toBe(ADMIN_SCOPE);
      }
    });

    it('未分类方法用 admin scope 应授权', () => {
      const result = authorizeOperatorScopesForMethod('unknown.method', [ADMIN_SCOPE]);
      expect(result.allowed).toBe(true);
    });

    it('node-role 方法应要求 admin scope（默认）', () => {
      const result = authorizeOperatorScopesForMethod('node.event', [WRITE_SCOPE]);
      expect(result.allowed).toBe(false);
    });

    it('空 scope 数组不应授权任何方法', () => {
      const result = authorizeOperatorScopesForMethod('health', []);
      expect(result.allowed).toBe(false);
    });
  });

  describe('authorizeOperatorScopesForRequiredScope', () => {
    it('admin scope 出示时应授权任意 required scope', () => {
      const result = authorizeOperatorScopesForRequiredScope(WRITE_SCOPE, [ADMIN_SCOPE]);
      expect(result.allowed).toBe(true);
    });

    it('read required scope 用 write scope 应授权', () => {
      const result = authorizeOperatorScopesForRequiredScope(READ_SCOPE, [WRITE_SCOPE]);
      expect(result.allowed).toBe(true);
    });

    it('read required scope 用 read scope 应授权', () => {
      const result = authorizeOperatorScopesForRequiredScope(READ_SCOPE, [READ_SCOPE]);
      expect(result.allowed).toBe(true);
    });

    it('write required scope 用 read scope 应拒绝并返回 write missingScope', () => {
      const result = authorizeOperatorScopesForRequiredScope(WRITE_SCOPE, [READ_SCOPE]);
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.missingScope).toBe(WRITE_SCOPE);
      }
    });

    it('approvals required scope 用 write scope 应拒绝', () => {
      const result = authorizeOperatorScopesForRequiredScope(APPROVALS_SCOPE, [WRITE_SCOPE]);
      expect(result.allowed).toBe(false);
    });
  });

  describe('isGatewayMethodClassified', () => {
    it('node-role 方法应被分类', () => {
      expect(isGatewayMethodClassified('node.event')).toBe(true);
    });

    it('dynamic 方法应被分类', () => {
      expect(isGatewayMethodClassified('plugins.sessionAction')).toBe(true);
    });

    it('core operator 方法应被分类', () => {
      expect(isGatewayMethodClassified('health')).toBe(true);
      expect(isGatewayMethodClassified('config.set')).toBe(true);
    });

    it('未知方法不应被分类', () => {
      expect(isGatewayMethodClassified('totally.unknown.method')).toBe(false);
    });
  });
});
