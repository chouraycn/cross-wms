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
  createPathPolicy,
  getPathPolicy,
  updatePathPolicy,
  deletePathPolicy,
  listPathPolicies,
  isPathAllowed,
  canWrite,
  canRead,
  clearPathPolicies,
  resolvePathFromInput,
} from '../path-policy.js';

describe('path-policy', () => {
  beforeEach(() => {
    clearPathPolicies();
  });

  describe('createPathPolicy', () => {
    it('应使用默认值创建策略并存入存储', () => {
      const policy = createPathPolicy({ id: 'p1', name: '测试策略' });
      expect(policy.id).toBe('p1');
      expect(policy.name).toBe('测试策略');
      expect(policy.allowedPaths).toEqual([]);
      expect(policy.deniedPaths).toEqual([]);
      expect(policy.allowedExtensions).toEqual([]);
      expect(policy.deniedExtensions).toEqual([]);
      expect(policy.allowSymlinks).toBe(false);
      expect(policy.allowHidden).toBe(false);
      expect(policy.readOnly).toBe(false);
      expect(policy.priority).toBe(0);
      expect(policy.enabled).toBe(true);
      expect(getPathPolicy('p1')).toBe(policy);
    });

    it('应接受完整配置', () => {
      const policy = createPathPolicy({
        id: 'p2',
        name: '完整',
        allowedPaths: ['/data'],
        deniedPaths: ['/secret'],
        allowedExtensions: ['.ts'],
        deniedExtensions: ['.env'],
        maxFileSizeBytes: 1024,
        allowSymlinks: true,
        allowHidden: true,
        readOnly: true,
        priority: 10,
      });
      expect(policy.allowedPaths).toEqual(['/data']);
      expect(policy.maxFileSizeBytes).toBe(1024);
      expect(policy.allowSymlinks).toBe(true);
      expect(policy.readOnly).toBe(true);
      expect(policy.priority).toBe(10);
    });
  });

  describe('getPathPolicy', () => {
    it('应返回已存在的策略', () => {
      createPathPolicy({ id: 'g1', name: 'g' });
      expect(getPathPolicy('g1')).toBeDefined();
    });

    it('应返回 undefined 表示未找到', () => {
      expect(getPathPolicy('not-exist')).toBeUndefined();
    });
  });

  describe('updatePathPolicy', () => {
    it('应更新字段并返回', () => {
      createPathPolicy({ id: 'u1', name: '原名' });
      const updated = updatePathPolicy('u1', { name: '新名', readOnly: true });
      expect(updated!.name).toBe('新名');
      expect(updated!.readOnly).toBe(true);
    });

    it('更新不存在的策略应返回 undefined', () => {
      expect(updatePathPolicy('ghost', { name: 'x' })).toBeUndefined();
    });
  });

  describe('deletePathPolicy', () => {
    it('应删除已存在的策略并返回 true', () => {
      createPathPolicy({ id: 'd1', name: 'd' });
      expect(deletePathPolicy('d1')).toBe(true);
      expect(getPathPolicy('d1')).toBeUndefined();
    });

    it('删除不存在的策略应返回 false', () => {
      expect(deletePathPolicy('ghost')).toBe(false);
    });
  });

  describe('listPathPolicies', () => {
    it('应按 priority 降序排列', () => {
      createPathPolicy({ id: 'lo', name: 'lo', priority: 1 });
      createPathPolicy({ id: 'hi', name: 'hi', priority: 10 });
      createPathPolicy({ id: 'mid', name: 'mid', priority: 5 });
      const list = listPathPolicies();
      expect(list[0].id).toBe('hi');
      expect(list[1].id).toBe('mid');
      expect(list[2].id).toBe('lo');
    });
  });

  describe('isPathAllowed', () => {
    it('策略不存在时应返回 true（宽松）', () => {
      expect(isPathAllowed('ghost', '/anywhere')).toBe(true);
    });

    it('策略被禁用时应返回 true', () => {
      createPathPolicy({ id: 'disabled', name: 'd' });
      updatePathPolicy('disabled', { enabled: false });
      expect(isPathAllowed('disabled', '/anywhere')).toBe(true);
    });

    it('应拒绝隐藏文件（以 . 开头）', () => {
      createPathPolicy({ id: 'hidden', name: 'h', allowHidden: false });
      expect(isPathAllowed('hidden', '/data/.secret')).toBe(false);
    });

    it('allowHidden 为 true 时应允许隐藏文件', () => {
      createPathPolicy({ id: 'hidden-ok', name: 'h', allowHidden: true });
      expect(isPathAllowed('hidden-ok', '/data/.secret')).toBe(true);
    });

    it('应拒绝 deniedPaths 中的路径前缀', () => {
      createPathPolicy({
        id: 'deny',
        name: 'd',
        deniedPaths: ['/forbidden'],
      });
      expect(isPathAllowed('deny', '/forbidden/file.txt')).toBe(false);
      expect(isPathAllowed('deny', '/allowed/file.txt')).toBe(true);
    });

    it('有 allowedPaths 时应仅允许列表内路径', () => {
      createPathPolicy({
        id: 'allow',
        name: 'a',
        allowedPaths: ['/workspace'],
      });
      expect(isPathAllowed('allow', '/workspace/src/index.ts')).toBe(true);
      expect(isPathAllowed('allow', '/other/src/index.ts')).toBe(false);
    });

    it('应拒绝 deniedExtensions 中的扩展名', () => {
      createPathPolicy({
        id: 'deny-ext',
        name: 'de',
        deniedExtensions: ['.env'],
      });
      expect(isPathAllowed('deny-ext', '/data/config.env')).toBe(false);
      expect(isPathAllowed('deny-ext', '/data/config.json')).toBe(true);
    });

    it('有 allowedExtensions 时应仅允许列表内扩展名', () => {
      createPathPolicy({
        id: 'allow-ext',
        name: 'ae',
        allowedExtensions: ['.ts', '.tsx'],
      });
      expect(isPathAllowed('allow-ext', '/src/index.ts')).toBe(true);
      expect(isPathAllowed('allow-ext', '/src/index.js')).toBe(false);
    });

    it('无扩展名的文件在 allowedExtensions 限制下应被允许', () => {
      createPathPolicy({
        id: 'no-ext',
        name: 'ne',
        allowedExtensions: ['.ts'],
      });
      expect(isPathAllowed('no-ext', '/src/Makefile')).toBe(true);
    });
  });

  describe('canWrite', () => {
    it('readOnly 策略应禁止写入', () => {
      createPathPolicy({ id: 'ro', name: 'ro', readOnly: true });
      expect(canWrite('ro', '/data/file.txt')).toBe(false);
    });

    it('非 readOnly 策略应允许写入（受 isPathAllowed 约束）', () => {
      createPathPolicy({ id: 'rw', name: 'rw', readOnly: false });
      expect(canWrite('rw', '/data/file.txt')).toBe(true);
    });

    it('策略不存在时应允许写入', () => {
      expect(canWrite('ghost', '/data/file.txt')).toBe(true);
    });
  });

  describe('canRead', () => {
    it('应委托给 isPathAllowed', () => {
      createPathPolicy({
        id: 'read',
        name: 'r',
        deniedPaths: ['/forbidden'],
      });
      expect(canRead('read', '/forbidden/file')).toBe(false);
      expect(canRead('read', '/allowed/file')).toBe(true);
    });
  });

  describe('resolvePathFromInput', () => {
    it('应原样返回绝对路径（已规范化）', () => {
      const result = resolvePathFromInput('/abs/../abs/file.txt', '/cwd');
      expect(result).toBe('/abs/file.txt');
    });

    it('应相对于 cwd 解析相对路径', () => {
      const result = resolvePathFromInput('src/index.ts', '/workspace');
      expect(result).toBe('/workspace/src/index.ts');
    });

    it('应处理 . 前缀的相对路径', () => {
      const result = resolvePathFromInput('./src/index.ts', '/workspace');
      expect(result).toBe('/workspace/src/index.ts');
    });

    it('应处理 .. 前缀的相对路径', () => {
      const result = resolvePathFromInput('../index.ts', '/workspace/sub');
      expect(result).toBe('/workspace/index.ts');
    });
  });

  describe('clearPathPolicies', () => {
    it('应清空所有策略', () => {
      createPathPolicy({ id: 'c1', name: 'a' });
      createPathPolicy({ id: 'c2', name: 'b' });
      clearPathPolicies();
      expect(listPathPolicies()).toHaveLength(0);
    });
  });
});
