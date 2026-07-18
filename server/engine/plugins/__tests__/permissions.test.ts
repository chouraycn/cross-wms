import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock logger to avoid pino side effects in jsdom
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
      isLevelEnabled: vi.fn(() => false),
    })),
  },
}));

import {
  setPluginPermissionPolicy,
  grantPluginPermission,
  denyPluginPermission,
  checkPluginPermission,
  clearPluginPermissions,
  listAllPermissionPolicies,
  getGrantedPermissions,
  getDeniedPermissions,
  listPermissionsByGroup,
  getPermissionDescriptor,
  PERMISSION_DESCRIPTORS,
  setPermissionResolver,
  createPermissionRequest,
  requestPermission,
  listPermissionRequests,
  expireStaleRequests,
  resetPermissionStateForTests,
} from '../permissions.js';

describe('plugins/permissions', () => {
  beforeEach(() => {
    resetPermissionStateForTests();
  });

  describe('基础 grant/deny/check', () => {
    it('grant 后 check 返回 true', () => {
      grantPluginPermission('p1', 'network');
      expect(checkPluginPermission('p1', 'network')).toBe(true);
    });

    it('未授权权限返回 false', () => {
      expect(checkPluginPermission('p2', 'network')).toBe(false);
    });

    it('deny 后即使曾 grant 也返回 false', () => {
      grantPluginPermission('p1', 'shell');
      denyPluginPermission('p1', 'shell');
      expect(checkPluginPermission('p1', 'shell')).toBe(false);
    });

    it('clearPluginPermissions 清空策略', () => {
      grantPluginPermission('p1', 'network');
      clearPluginPermissions('p1');
      expect(checkPluginPermission('p1', 'network')).toBe(false);
    });
  });

  describe('批量与导出', () => {
    it('listAllPermissionPolicies 返回所有策略', () => {
      grantPluginPermission('p1', 'network');
      grantPluginPermission('p2', 'shell');
      expect(listAllPermissionPolicies().length).toBe(2);
    });

    it('getGrantedPermissions 返回已授予权限副本', () => {
      grantPluginPermission('p1', 'network');
      const granted = getGrantedPermissions('p1');
      expect(granted).toEqual(['network']);
      granted.push('shell');
      expect(getGrantedPermissions('p1')).toEqual(['network']);
    });

    it('getDeniedPermissions 返回拒绝列表', () => {
      denyPluginPermission('p1', 'shell');
      expect(getDeniedPermissions('p1')).toEqual(['shell']);
    });

    it('listPermissionsByGroup 按分组过滤', () => {
      const networkPerms = listPermissionsByGroup('network');
      expect(networkPerms).toContain('network');
      expect(networkPerms).toContain('http.fetch');
    });

    it('getPermissionDescriptor 返回描述符', () => {
      const desc = getPermissionDescriptor('network');
      expect(desc.group).toBe('network');
      expect(desc.label).toBeTruthy();
    });

    it('PERMISSION_DESCRIPTORS 覆盖所有权限', () => {
      // 14 个权限
      expect(Object.keys(PERMISSION_DESCRIPTORS).length).toBeGreaterThanOrEqual(11);
    });
  });

  describe('setPluginPermissionPolicy', () => {
    it('整体设置策略', () => {
      setPluginPermissionPolicy({
        pluginId: 'p1',
        granted: ['network'],
        denied: ['shell'],
      });
      expect(checkPluginPermission('p1', 'network')).toBe(true);
      expect(checkPluginPermission('p1', 'shell')).toBe(false);
    });
  });

  describe('权限请求流程', () => {
    it('createPermissionRequest 创建 pending 请求', () => {
      const req = createPermissionRequest('p1', 'network', '需要联网');
      expect(req.state).toBe('pending');
      expect(req.pluginId).toBe('p1');
      expect(req.reason).toBe('需要联网');
    });

    it('已授权的权限直接返回 true', async () => {
      grantPluginPermission('p1', 'network');
      const granted = await requestPermission('p1', 'network');
      expect(granted).toBe(true);
    });

    it('defaultGrant 权限自动授予', async () => {
      // tool.register 默认授权
      const granted = await requestPermission('p1', 'tool.register');
      expect(granted).toBe(true);
      expect(checkPluginPermission('p1', 'tool.register')).toBe(true);
    });

    it('有 resolver 时调用 resolver 决策', async () => {
      setPermissionResolver(async () => ({ granted: true }));
      const granted = await requestPermission('p1', 'shell');
      expect(granted).toBe(true);
    });

    it('resolver 拒绝时返回 false 并记录 deny', async () => {
      setPermissionResolver(async () => ({ granted: false }));
      const granted = await requestPermission('p1', 'shell');
      expect(granted).toBe(false);
      expect(checkPluginPermission('p1', 'shell')).toBe(false);
    });

    it('无 resolver 时非 defaultGrant 返回 false', async () => {
      const granted = await requestPermission('p1', 'shell');
      expect(granted).toBe(false);
    });

    it('listPermissionRequests 按插件过滤', () => {
      createPermissionRequest('p1', 'network');
      createPermissionRequest('p2', 'shell');
      expect(listPermissionRequests('p1').length).toBe(1);
      expect(listPermissionRequests().length).toBe(2);
    });

    it('expireStaleRequests 让旧请求过期', () => {
      const req = createPermissionRequest('p1', 'network');
      // 手动回退创建时间
      req.createdAt = Date.now() - 10_000;
      const expired = expireStaleRequests(5_000);
      expect(expired).toBe(1);
      expect(req.state).toBe('expired');
    });
  });
});
