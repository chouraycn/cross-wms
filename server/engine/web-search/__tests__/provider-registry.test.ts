/**
 * Search Provider Registry 单元测试
 *
 * 测试 Provider 注册、查找、排序和实例化功能。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerProvider,
  unregisterProvider,
  hasProvider,
  getProviderEntry,
  getAllProviders,
  getDomesticProviders,
  getInternationalProviders,
  getProvidersSortedByPriority,
  getProviderInstance,
  clearAllInstances,
  getProviderCount,
  resetRegistry,
} from '../provider-registry.js';
import type { SearchProvider, SearchProviderConstructorOptions } from '../types.js';

vi.mock('../../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Search Provider Registry', () => {
  beforeEach(() => {
    resetRegistry();
  });

  describe('注册和注销', () => {
    it('应能注册新的 Provider', () => {
      const mockFactory = vi.fn((): SearchProvider => ({
        id: 'test-provider',
        name: 'Test',
        description: 'Test provider',
        isDomestic: true,
        supportsRegions: ['zh-CN'],
        defaultPriority: 1,
        search: vi.fn(),
        isAvailable: () => true,
      }));

      registerProvider({
        id: 'test-provider',
        factory: mockFactory,
        isDomestic: true,
        defaultPriority: 1,
      });

      expect(hasProvider('test-provider')).toBe(true);
      expect(getProviderCount()).toBe(1);
    });

    it('应能注销已注册的 Provider', () => {
      const mockFactory = vi.fn();

      registerProvider({
        id: 'test-provider',
        factory: mockFactory,
        isDomestic: true,
        defaultPriority: 1,
      });

      expect(hasProvider('test-provider')).toBe(true);

      const result = unregisterProvider('test-provider');
      expect(result).toBe(true);
      expect(hasProvider('test-provider')).toBe(false);
      expect(getProviderCount()).toBe(0);
    });

    it('注销不存在的 Provider 应返回 false', () => {
      const result = unregisterProvider('non-existent');
      expect(result).toBe(false);
    });

    it('重复注册应覆盖原有 Provider', () => {
      const mockFactory1 = vi.fn();
      const mockFactory2 = vi.fn();

      registerProvider({
        id: 'test-provider',
        factory: mockFactory1,
        isDomestic: true,
        defaultPriority: 1,
      });

      registerProvider({
        id: 'test-provider',
        factory: mockFactory2,
        isDomestic: false,
        defaultPriority: 5,
      });

      const entry = getProviderEntry('test-provider');
      expect(entry).toBeDefined();
      expect(entry?.isDomestic).toBe(false);
      expect(entry?.defaultPriority).toBe(5);
    });
  });

  describe('查询功能', () => {
    beforeEach(() => {
      registerProvider({
        id: 'baidu',
        factory: vi.fn(),
        isDomestic: true,
        defaultPriority: 1,
      });
      registerProvider({
        id: 'bing-cn',
        factory: vi.fn(),
        isDomestic: true,
        defaultPriority: 2,
      });
      registerProvider({
        id: 'google',
        factory: vi.fn(),
        isDomestic: false,
        defaultPriority: 7,
      });
    });

    it('getAllProviders 应返回所有 Provider', () => {
      const all = getAllProviders();
      expect(all.length).toBe(3);
    });

    it('getDomesticProviders 应只返回国内 Provider', () => {
      const domestic = getDomesticProviders();
      expect(domestic.length).toBe(2);
      expect(domestic.every((p) => p.isDomestic)).toBe(true);
    });

    it('getInternationalProviders 应只返回国际 Provider', () => {
      const international = getInternationalProviders();
      expect(international.length).toBe(1);
      expect(international[0].id).toBe('google');
    });

    it('getProviderEntry 应返回指定 Provider', () => {
      const entry = getProviderEntry('baidu');
      expect(entry).toBeDefined();
      expect(entry?.id).toBe('baidu');
    });

    it('getProviderEntry 不存在时返回 undefined', () => {
      const entry = getProviderEntry('non-existent');
      expect(entry).toBeUndefined();
    });
  });

  describe('排序功能', () => {
    beforeEach(() => {
      registerProvider({
        id: 'google',
        factory: vi.fn(),
        isDomestic: false,
        defaultPriority: 7,
      });
      registerProvider({
        id: 'baidu',
        factory: vi.fn(),
        isDomestic: true,
        defaultPriority: 1,
      });
      registerProvider({
        id: 'bing-cn',
        factory: vi.fn(),
        isDomestic: true,
        defaultPriority: 2,
      });
    });

    it('国内优先模式下，国内 Provider 应排在前面', () => {
      const sorted = getProvidersSortedByPriority(true);
      expect(sorted[0].isDomestic).toBe(true);
      expect(sorted[1].isDomestic).toBe(true);
      expect(sorted[2].isDomestic).toBe(false);
    });

    it('同区域内按优先级排序', () => {
      const sorted = getProvidersSortedByPriority(true);
      const domestic = sorted.filter((p) => p.isDomestic);
      expect(domestic[0].defaultPriority).toBeLessThan(domestic[1].defaultPriority);
    });

    it('非国内优先模式下，只按优先级排序', () => {
      const sorted = getProvidersSortedByPriority(false);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i - 1].defaultPriority).toBeLessThanOrEqual(sorted[i].defaultPriority);
      }
    });
  });

  describe('实例化', () => {
    it('应能创建 Provider 实例', () => {
      const mockProvider: SearchProvider = {
        id: 'test-provider',
        name: 'Test',
        description: 'Test provider',
        isDomestic: true,
        supportsRegions: ['zh-CN'],
        defaultPriority: 1,
        search: vi.fn(),
        isAvailable: () => true,
      };

      const mockFactory = vi.fn((): SearchProvider => mockProvider);

      registerProvider({
        id: 'test-provider',
        factory: mockFactory,
        isDomestic: true,
        defaultPriority: 1,
      });

      const instance = getProviderInstance('test-provider');
      expect(instance).not.toBeNull();
      expect(instance?.id).toBe('test-provider');
      expect(mockFactory).toHaveBeenCalled();
    });

    it('多次获取应返回缓存的实例', () => {
      const mockFactory = vi.fn((): SearchProvider => ({
        id: 'test-provider',
        name: 'Test',
        description: 'Test',
        isDomestic: true,
        supportsRegions: [],
        defaultPriority: 1,
        search: vi.fn(),
        isAvailable: () => true,
      }));

      registerProvider({
        id: 'test-provider',
        factory: mockFactory,
        isDomestic: true,
        defaultPriority: 1,
      });

      getProviderInstance('test-provider');
      getProviderInstance('test-provider');

      expect(mockFactory).toHaveBeenCalledTimes(1);
    });

    it('传入 options 时应创建新实例', () => {
      const mockFactory = vi.fn((): SearchProvider => ({
        id: 'test-provider',
        name: 'Test',
        description: 'Test',
        isDomestic: true,
        supportsRegions: [],
        defaultPriority: 1,
        search: vi.fn(),
        isAvailable: () => true,
      }));

      registerProvider({
        id: 'test-provider',
        factory: mockFactory,
        isDomestic: true,
        defaultPriority: 1,
      });

      const options: SearchProviderConstructorOptions = { apiKey: 'test-key' };
      getProviderInstance('test-provider', options);

      expect(mockFactory).toHaveBeenCalledWith(options);
    });

    it('获取不存在的 Provider 应返回 null', () => {
      const instance = getProviderInstance('non-existent');
      expect(instance).toBeNull();
    });
  });

  describe('实例缓存管理', () => {
    it('clearAllInstances 应清除所有实例缓存', () => {
      const mockFactory = vi.fn((): SearchProvider => ({
        id: 'test-provider',
        name: 'Test',
        description: 'Test',
        isDomestic: true,
        supportsRegions: [],
        defaultPriority: 1,
        search: vi.fn(),
        isAvailable: () => true,
      }));

      registerProvider({
        id: 'test-provider',
        factory: mockFactory,
        isDomestic: true,
        defaultPriority: 1,
      });

      getProviderInstance('test-provider');
      expect(mockFactory).toHaveBeenCalledTimes(1);

      clearAllInstances();

      getProviderInstance('test-provider');
      expect(mockFactory).toHaveBeenCalledTimes(2);
    });

    it('resetRegistry 应重置所有状态', () => {
      registerProvider({
        id: 'test-provider',
        factory: vi.fn(),
        isDomestic: true,
        defaultPriority: 1,
      });

      expect(getProviderCount()).toBe(1);

      resetRegistry();

      expect(getProviderCount()).toBe(0);
      expect(hasProvider('test-provider')).toBe(false);
    });
  });
});
