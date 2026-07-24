import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  createScope,
  getScope,
  updateScope,
  deleteScope,
  listScopes,
  getChildScopes,
  getScopeHierarchy,
  isToolAllowedInScope,
  isPathAllowedInScope,
  clearScopes,
} from '../agent-scope.js';

describe('agent-scope', () => {
  beforeEach(() => {
    clearScopes();
  });

  describe('createScope', () => {
    it('应使用默认值创建 scope 并存入存储', () => {
      const scope = createScope({ id: 's1', name: '测试', type: 'project' });
      expect(scope.id).toBe('s1');
      expect(scope.name).toBe('测试');
      expect(scope.type).toBe('project');
      expect(scope.allowedTools).toEqual([]);
      expect(scope.deniedTools).toEqual([]);
      expect(scope.allowedPaths).toEqual([]);
      expect(scope.deniedPaths).toEqual([]);
      expect(scope.metadata).toEqual({});
      expect(scope.createdAt).toBeTypeOf('number');
      expect(scope.updatedAt).toBe(scope.createdAt);
      expect(getScope('s1')).toBe(scope);
    });

    it('应接受完整的可选参数', () => {
      const scope = createScope({
        id: 's2',
        name: '完整',
        type: 'agent',
        parentScopeId: 'parent',
        allowedTools: ['read', 'write'],
        deniedTools: ['delete'],
        allowedPaths: ['/data'],
        deniedPaths: ['/secret'],
        maxTokens: 1000,
        maxDurationMs: 5000,
        maxToolCalls: 10,
        metadata: { env: 'test' },
      });
      expect(scope.parentScopeId).toBe('parent');
      expect(scope.allowedTools).toEqual(['read', 'write']);
      expect(scope.deniedTools).toEqual(['delete']);
      expect(scope.maxTokens).toBe(1000);
      expect(scope.maxDurationMs).toBe(5000);
      expect(scope.maxToolCalls).toBe(10);
      expect(scope.metadata).toEqual({ env: 'test' });
    });

    it('应拒绝无效的 type', () => {
      expect(() =>
        createScope({ id: 'bad', name: 'bad', type: 'invalid' as any }),
      ).toThrow();
    });

    it('同 id 重复创建应覆盖', () => {
      const first = createScope({ id: 'dup', name: '第一', type: 'project' });
      const second = createScope({ id: 'dup', name: '第二', type: 'session' });
      expect(getScope('dup')).toBe(second);
      expect(getScope('dup')!.name).toBe('第二');
      expect(listScopes()).toHaveLength(1);
    });
  });

  describe('getScope', () => {
    it('应返回已存在的 scope', () => {
      createScope({ id: 'g1', name: 'g', type: 'global' });
      expect(getScope('g1')).toBeDefined();
      expect(getScope('g1')!.name).toBe('g');
    });

    it('应返回 undefined 表示未找到', () => {
      expect(getScope('not-exist')).toBeUndefined();
    });
  });

  describe('updateScope', () => {
    it('应更新字段并刷新 updatedAt', () => {
      const created = createScope({ id: 'u1', name: '原名', type: 'project' });
      const updated = updateScope('u1', { name: '新名', maxTokens: 500 });
      expect(updated).toBeDefined();
      expect(updated!.name).toBe('新名');
      expect(updated!.maxTokens).toBe(500);
      expect(updated!.id).toBe('u1');
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    });

    it('更新不存在的 scope 应返回 undefined', () => {
      expect(updateScope('ghost', { name: 'x' })).toBeUndefined();
    });
  });

  describe('deleteScope', () => {
    it('应删除已存在的 scope 并返回 true', () => {
      createScope({ id: 'd1', name: 'd', type: 'session' });
      expect(deleteScope('d1')).toBe(true);
      expect(getScope('d1')).toBeUndefined();
    });

    it('删除不存在的 scope 应返回 false', () => {
      expect(deleteScope('ghost')).toBe(false);
    });
  });

  describe('listScopes 和 clearScopes', () => {
    it('listScopes 应返回所有 scope', () => {
      createScope({ id: 'l1', name: 'a', type: 'project' });
      createScope({ id: 'l2', name: 'b', type: 'session' });
      expect(listScopes()).toHaveLength(2);
    });

    it('clearScopes 应清空存储', () => {
      createScope({ id: 'c1', name: 'a', type: 'project' });
      createScope({ id: 'c2', name: 'b', type: 'session' });
      clearScopes();
      expect(listScopes()).toHaveLength(0);
    });
  });

  describe('getChildScopes', () => {
    it('应返回直接子 scope', () => {
      createScope({ id: 'root', name: 'root', type: 'global' });
      createScope({ id: 'child1', name: 'c1', type: 'project', parentScopeId: 'root' });
      createScope({ id: 'child2', name: 'c2', type: 'project', parentScopeId: 'root' });
      createScope({ id: 'other', name: 'o', type: 'project', parentScopeId: 'other-root' });
      const children = getChildScopes('root');
      expect(children).toHaveLength(2);
      const ids = children.map((c) => c.id);
      expect(ids).toContain('child1');
      expect(ids).toContain('child2');
    });

    it('无子 scope 时应返回空数组', () => {
      createScope({ id: 'lonely', name: 'l', type: 'global' });
      expect(getChildScopes('lonely')).toEqual([]);
    });
  });

  describe('getScopeHierarchy', () => {
    it('应从子向上遍历到根', () => {
      createScope({ id: 'root', name: 'root', type: 'global' });
      createScope({ id: 'mid', name: 'mid', type: 'project', parentScopeId: 'root' });
      createScope({ id: 'leaf', name: 'leaf', type: 'session', parentScopeId: 'mid' });
      const hierarchy = getScopeHierarchy('leaf');
      expect(hierarchy).toHaveLength(3);
      expect(hierarchy[0].id).toBe('root');
      expect(hierarchy[1].id).toBe('mid');
      expect(hierarchy[2].id).toBe('leaf');
    });

    it('根 scope 的层级应只包含自身', () => {
      createScope({ id: 'solo', name: 's', type: 'global' });
      const hierarchy = getScopeHierarchy('solo');
      expect(hierarchy).toHaveLength(1);
      expect(hierarchy[0].id).toBe('solo');
    });
  });

  describe('isToolAllowedInScope', () => {
    it('deny 优先：在 deniedTools 中的工具应被拒绝', () => {
      createScope({
        id: 't1',
        name: 't',
        type: 'project',
        deniedTools: ['delete'],
      });
      expect(isToolAllowedInScope('t1', 'delete')).toBe(false);
    });

    it('未在 denied 中的工具应被允许', () => {
      createScope({
        id: 't2',
        name: 't',
        type: 'project',
        deniedTools: ['delete'],
      });
      expect(isToolAllowedInScope('t2', 'read')).toBe(true);
    });

    it('allowedTools 提供提前允许但不限制未列出的工具（默认允许）', () => {
      createScope({
        id: 't3',
        name: 't',
        type: 'project',
        allowedTools: ['read', 'write'],
      });
      expect(isToolAllowedInScope('t3', 'read')).toBe(true);
      expect(isToolAllowedInScope('t3', 'write')).toBe(true);
      // 未在 allowedTools 中的工具仍被允许（default allow）
      expect(isToolAllowedInScope('t3', 'delete')).toBe(true);
    });

    it('通配符 * 应匹配所有工具', () => {
      createScope({
        id: 't4',
        name: 't',
        type: 'project',
        allowedTools: ['*'],
      });
      expect(isToolAllowedInScope('t4', 'anything')).toBe(true);
    });

    it('前缀通配符 tool.* 应匹配子工具', () => {
      createScope({
        id: 't5',
        name: 't',
        type: 'project',
        allowedTools: ['tool.*'],
      });
      expect(isToolAllowedInScope('t5', 'tool.read')).toBe(true);
      // 未匹配的工具仍被允许（default allow）
      expect(isToolAllowedInScope('t5', 'other')).toBe(true);
    });

    it('无限制时默认允许所有工具', () => {
      createScope({ id: 't6', name: 't', type: 'global' });
      expect(isToolAllowedInScope('t6', 'anything')).toBe(true);
    });

    it('父 scope 的 deniedTools 应在子 scope 生效', () => {
      createScope({
        id: 'parent',
        name: 'p',
        type: 'global',
        deniedTools: ['dangerous'],
      });
      createScope({
        id: 'child',
        name: 'c',
        type: 'project',
        parentScopeId: 'parent',
      });
      expect(isToolAllowedInScope('child', 'dangerous')).toBe(false);
    });
  });

  describe('isPathAllowedInScope', () => {
    it('deniedPaths 中的前缀路径应被拒绝', () => {
      createScope({
        id: 'p1',
        name: 'p',
        type: 'project',
        deniedPaths: ['/secret'],
      });
      expect(isPathAllowedInScope('p1', '/secret/data')).toBe(false);
    });

    it('allowedPaths 提供提前允许但不限制未列出的路径（默认允许）', () => {
      createScope({
        id: 'p2',
        name: 'p',
        type: 'project',
        allowedPaths: ['/workspace'],
      });
      expect(isPathAllowedInScope('p2', '/workspace/file.txt')).toBe(true);
      // 未匹配的路径仍被允许（default allow）
      expect(isPathAllowedInScope('p2', '/other/file.txt')).toBe(true);
    });

    it('无限制时默认允许所有路径', () => {
      createScope({ id: 'p3', name: 'p', type: 'global' });
      expect(isPathAllowedInScope('p3', '/anywhere')).toBe(true);
    });
  });
});
