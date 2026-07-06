/**
 * Memory Host 单元测试
 *
 * 覆盖 P0-3 记忆系统插件化：
 * - MemoryHostRegistry 注册/查询
 * - VecMemoryHost 注册函数
 * - BaseMemoryHost 抽象接口
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getGlobalMemoryHostRegistry } from '../memory-host/index.js';
import { registerVecMemoryHost } from '../memory-host/vecMemoryHost.js';

// mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// mock VecMemoryStore（避免初始化真实数据库）
vi.mock('../vecMemoryStore.js', () => ({
  vecMemoryStore: {
    init: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockReturnValue({ totalVectors: 0 }),
  },
  // 导出函数 mock（VecMemoryHost.init 会调用这些）
  insertMemoryWithChunks: vi.fn().mockResolvedValue(['id-1']),
  hybridSearchMemory: vi.fn().mockResolvedValue([]),
  getMemory: vi.fn().mockReturnValue(null),
  deleteMemory: vi.fn().mockReturnValue(true),
  getRecentMemories: vi.fn().mockReturnValue([]),
  getMemoryStats: vi.fn().mockReturnValue({ totalVectors: 0 }),
}));

// mock databaseManager
vi.mock('../../dao/databaseManager.js', () => ({
  getDb: vi.fn().mockReturnValue({}),
}));

describe('Memory Host', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MemoryHostRegistry', () => {
    it('应能获取全局单例', () => {
      const registry1 = getGlobalMemoryHostRegistry();
      const registry2 = getGlobalMemoryHostRegistry();
      expect(registry1).toBe(registry2);
    });

    it('初始状态下应能调用 listHosts 方法', () => {
      const registry = getGlobalMemoryHostRegistry();
      const hosts = registry.listHosts();
      // 验证 listHosts 方法返回数组（MemoryHostConfig[]）
      expect(Array.isArray(hosts)).toBe(true);
    });
  });

  describe('registerVecMemoryHost', () => {
    it('应能注册 VecMemoryHost 到 registry', () => {
      const registry = getGlobalMemoryHostRegistry();
      registerVecMemoryHost(registry);

      // listHosts 返回 MemoryHostConfig[]
      const hosts = registry.listHosts();
      const vecHostConfig = hosts.find(h => h.hostId === 'vec-memory');
      expect(vecHostConfig).toBeDefined();
      // VecMemoryHost 的实际 displayName 是 "Vector Memory Store"
      expect(vecHostConfig!.displayName).toBe('Vector Memory Store');
    });

    it('注册后应能通过 getConfig 获取 host 配置', () => {
      const registry = getGlobalMemoryHostRegistry();
      registerVecMemoryHost(registry);

      // getConfig 返回 MemoryHostConfig
      const config = registry.getConfig('vec-memory');
      expect(config).toBeDefined();
      expect(config!.hostId).toBe('vec-memory');
    });

    it('注册后应能通过 getHost 获取 host 实例（异步）', async () => {
      const registry = getGlobalMemoryHostRegistry();
      registerVecMemoryHost(registry);

      // getHost 是异步方法，返回 BaseMemoryHost 实例
      const host = await registry.getHost('vec-memory');
      expect(host).toBeDefined();
      expect(host.isReady()).toBe(true);
    });

    it('注册后应能查询 host 是否存在', () => {
      const registry = getGlobalMemoryHostRegistry();
      registerVecMemoryHost(registry);

      expect(registry.has('vec-memory')).toBe(true);
    });
  });
});
