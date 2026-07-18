import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import {
  CommitmentsFullChain,
  getCommitmentsFullChain,
  resetCommitmentsFullChainForTests,
} from '../index.js';
import type { CommitmentsConfigInput } from '../index.js';

describe('commitments-full-chain', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `commitments-fullchain-test-${randomUUID()}`);
    resetCommitmentsFullChainForTests();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    resetCommitmentsFullChainForTests();
  });

  describe('创建和初始化', () => {
    it('应该创建完整链路实例', () => {
      const config: CommitmentsConfigInput = {
        commitments: { enabled: true },
      };
      const fullChain = new CommitmentsFullChain({ config });
      expect(fullChain).toBeDefined();
      expect(fullChain.getConfig().enabled).toBe(true);
    });

    it('禁用时应该返回禁用状态', () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: false } },
      });
      expect(fullChain.getConfig().enabled).toBe(false);
    });

    it('getConfig 应该返回配置', () => {
      const config: CommitmentsConfigInput = {
        commitments: { enabled: true, maxPerDay: 10 },
      };
      const fullChain = new CommitmentsFullChain({ config });
      const got = fullChain.getConfig();
      expect(got.enabled).toBe(true);
      expect(got.maxPerDay).toBe(10);
    });

    it('getRuntime 应该返回运行时实例', () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      const runtime = fullChain.getRuntime();
      expect(runtime).toBeDefined();
      expect(typeof runtime.enqueueExtraction).toBe('function');
    });

    it('getHeartbeatPolicy 应该返回心跳策略实例', () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      const policy = fullChain.getHeartbeatPolicy();
      expect(policy).toBeDefined();
      expect(typeof policy.run).toBe('function');
    });

    it('getModelSelector 应该返回模型选择器实例', () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      const selector = fullChain.getModelSelector();
      expect(selector).toBeDefined();
      expect(typeof selector.selectModel).toBe('function');
    });
  });

  describe('全局实例', () => {
    it('getCommitmentsFullChain 应该返回单例', () => {
      const instance1 = getCommitmentsFullChain();
      const instance2 = getCommitmentsFullChain();
      expect(instance1).toBe(instance2);
    });

    it('resetCommitmentsFullChainForTests 应该重置单例', () => {
      const instance1 = getCommitmentsFullChain();
      resetCommitmentsFullChainForTests();
      const instance2 = getCommitmentsFullChain();
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('状态管理', () => {
    it('isShutdownStatus 初始应该为 false', () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      expect(fullChain.isShutdownStatus()).toBe(false);
    });

    it('shutdown 应该关闭实例', async () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      await fullChain.shutdown();
      expect(fullChain.isShutdownStatus()).toBe(true);
    });

    it('关闭后 enqueueExtraction 应该返回 false', async () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      await fullChain.shutdown();
      const result = fullChain.enqueueExtraction({
        scope: { agentId: 'a', sessionKey: 's', channel: 'c' },
        itemId: 'item-1',
        userText: 'test',
        assistantText: '',
        nowMs: Date.now(),
        timezone: 'Asia/Shanghai',
      });
      expect(result).toBe(false);
    });

    it('resetForTests 应该重置状态', async () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      await fullChain.shutdown();
      expect(fullChain.isShutdownStatus()).toBe(true);
      fullChain.resetForTests();
      expect(fullChain.isShutdownStatus()).toBe(false);
    });
  });

  describe('统计信息', () => {
    it('getStats 应该返回完整统计', () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      const stats = fullChain.getStats();
      expect(stats).toBeDefined();
      expect(stats.runtime).toBeDefined();
      expect(stats.heartbeat).toBeDefined();
      expect(stats.modelSelection).toBeDefined();
    });

    it('getStoreStats 应该返回存储统计', async () => {
      await mkdir(testDir, { recursive: true });
      const storePath = join(testDir, 'commitments.json');
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
        storePath,
      });
      const stats = await fullChain.getStoreStats();
      expect(stats).toBeDefined();
      expect(typeof stats.total).toBe('number');
    });
  });

  describe('模型选择', () => {
    it('selectModel 应该选择模型', () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      const result = fullChain.selectModel({ priority: 'high' });
      expect(result).toBeDefined();
      expect(result.model).toBeDefined();
    });
  });

  describe('心跳', () => {
    it('runHeartbeat 应该返回心跳结果', async () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      const result = await fullChain.runHeartbeat({
        agentId: 'test-agent',
        sessionKey: 'test-session',
      });
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
    });
  });

  describe('存储写入器', () => {
    it('默认没有存储写入器', () => {
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
      });
      expect(fullChain.getStoreWriter()).toBeUndefined();
    });

    it('配置了 storeWriterOptions 应该有写入器', async () => {
      await mkdir(testDir, { recursive: true });
      const storePath = join(testDir, 'commitments.json');
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
        storePath,
        storeWriterOptions: { debounceMs: 100 },
      });
      expect(fullChain.getStoreWriter()).toBeDefined();
      await fullChain.shutdown();
    });

    it('flushStore 应该刷新存储', async () => {
      await mkdir(testDir, { recursive: true });
      const storePath = join(testDir, 'commitments.json');
      const fullChain = new CommitmentsFullChain({
        config: { commitments: { enabled: true } },
        storePath,
        storeWriterOptions: { debounceMs: 100 },
      });
      await fullChain.flushStore();
      await fullChain.shutdown();
    });
  });
});
