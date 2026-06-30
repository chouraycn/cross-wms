// @vitest-environment node

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CompactionHookManager,
  getGlobalCompactionHookManager,
  setGlobalCompactionHookManager,
  createCompactionHooks,
  createLoggingHook,
  createMemorySyncHook,
  createTranscriptUpdateHook,
  type CompactionMetrics,
  type CompactionContext,
} from '../compaction-hooks.js';

describe('compaction-hooks', () => {
  let manager: CompactionHookManager;

  beforeEach(() => {
    manager = new CompactionHookManager();
  });

  const testMetrics: CompactionMetrics = {
    messageCount: 10,
    tokenCount: 100,
    compactedCount: 5,
    sessionId: 'test-session',
  };

  const testContext: CompactionContext = {
    sessionId: 'test-session',
    agentId: 'test-agent',
  };

  describe('addHook / removeHook', () => {
    it('应该添加钩子并返回 ID', () => {
      const id = manager.addHook('before', () => {});
      expect(id).toBeTruthy();
      expect(manager.getHookCount('before')).toBe(1);
    });

    it('应该添加多个钩子', () => {
      manager.addHook('before', () => {});
      manager.addHook('before', () => {});
      manager.addHook('after', () => {});
      expect(manager.getHookCount('before')).toBe(2);
      expect(manager.getHookCount('after')).toBe(1);
      expect(manager.getHookCount()).toBe(3);
    });

    it('应该移除已存在的钩子', () => {
      const id = manager.addHook('before', () => {});
      const result = manager.removeHook(id);
      expect(result).toBe(true);
      expect(manager.getHookCount('before')).toBe(0);
    });

    it('移除不存在的钩子应该返回 false', () => {
      const result = manager.removeHook('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('钩子优先级', () => {
    it('高优先级钩子应该先执行', async () => {
      const executionOrder: string[] = [];

      manager.addHook(
        'before',
        () => {
          executionOrder.push('low');
        },
        0,
      );
      manager.addHook(
        'before',
        () => {
          executionOrder.push('high');
        },
        10,
      );
      manager.addHook(
        'before',
        () => {
          executionOrder.push('medium');
        },
        5,
      );

      await manager.runBeforeHooks(testMetrics, testContext);

      expect(executionOrder).toEqual(['high', 'medium', 'low']);
    });
  });

  describe('runBeforeHooks', () => {
    it('应该执行所有 before 钩子', async () => {
      let called1 = false;
      let called2 = false;

      manager.addHook('before', () => {
        called1 = true;
      });
      manager.addHook('before', () => {
        called2 = true;
      });

      await manager.runBeforeHooks(testMetrics, testContext);

      expect(called1).toBe(true);
      expect(called2).toBe(true);
    });

    it('应该传递 metrics 和 context', async () => {
      let receivedMetrics: CompactionMetrics | null = null;
      let receivedContext: CompactionContext | null = null;

      manager.addHook('before', (metrics, context) => {
        receivedMetrics = metrics;
        receivedContext = context;
      });

      await manager.runBeforeHooks(testMetrics, testContext);

      expect(receivedMetrics).toEqual(testMetrics);
      expect(receivedContext).toEqual(testContext);
    });

    it('钩子失败不应该影响其他钩子', async () => {
      let secondCalled = false;

      manager.addHook('before', () => {
        throw new Error('First hook failed');
      });
      manager.addHook('before', () => {
        secondCalled = true;
      });

      await manager.runBeforeHooks(testMetrics, testContext);

      expect(secondCalled).toBe(true);
    });
  });

  describe('runAfterHooks', () => {
    it('应该执行所有 after 钩子', async () => {
      let called = false;

      manager.addHook('after', () => {
        called = true;
      });

      await manager.runAfterHooks(testMetrics, testContext);

      expect(called).toBe(true);
    });
  });

  describe('clear', () => {
    it('应该清空所有钩子', () => {
      manager.addHook('before', () => {});
      manager.addHook('after', () => {});
      manager.addHook('before', () => {});

      manager.clear();

      expect(manager.getHookCount()).toBe(0);
    });
  });

  describe('全局管理器', () => {
    it('应该获取全局管理器', () => {
      const mgr = getGlobalCompactionHookManager();
      expect(mgr).toBeInstanceOf(CompactionHookManager);
    });

    it('应该设置全局管理器', () => {
      const newMgr = new CompactionHookManager();
      setGlobalCompactionHookManager(newMgr);
      expect(getGlobalCompactionHookManager()).toBe(newMgr);
    });
  });

  describe('createCompactionHooks', () => {
    it('应该创建新的管理器实例', () => {
      const hooks = createCompactionHooks();
      expect(hooks).toBeInstanceOf(CompactionHookManager);
      expect(hooks.getHookCount()).toBe(0);
    });
  });

  describe('createLoggingHook', () => {
    it('应该创建日志钩子', () => {
      const hook = createLoggingHook('before');
      expect(typeof hook).toBe('function');
    });

    it('应该调用自定义 logger', async () => {
      let logged = false;
      const hook = createLoggingHook('before', () => {
        logged = true;
      });

      await hook(testMetrics, testContext);
      expect(logged).toBe(true);
    });
  });

  describe('createMemorySyncHook', () => {
    it('应该创建记忆同步钩子', async () => {
      let synced = false;
      const hook = createMemorySyncHook(async () => {
        synced = true;
      });

      await hook(
        { ...testMetrics, sessionFile: 'test.json', compactedCount: 5 },
        testContext,
      );

      expect(synced).toBe(true);
    });

    it('没有压缩时不应该同步', async () => {
      let synced = false;
      const hook = createMemorySyncHook(async () => {
        synced = true;
      });

      await hook(
        { ...testMetrics, sessionFile: 'test.json', compactedCount: 0 },
        testContext,
      );

      expect(synced).toBe(false);
    });

    it('同步失败不应该抛出', async () => {
      const hook = createMemorySyncHook(async () => {
        throw new Error('Sync failed');
      });

      await expect(
        hook(
          { ...testMetrics, sessionFile: 'test.json', compactedCount: 5 },
          testContext,
        ),
      ).resolves.not.toThrow();
    });
  });

  describe('createTranscriptUpdateHook', () => {
    it('应该创建转录本更新钩子', async () => {
      let updated = false;
      const hook = createTranscriptUpdateHook(async () => {
        updated = true;
      });

      await hook({ ...testMetrics, sessionFile: 'test.json' }, testContext);
      expect(updated).toBe(true);
    });

    it('更新失败不应该抛出', async () => {
      const hook = createTranscriptUpdateHook(async () => {
        throw new Error('Update failed');
      });

      await expect(
        hook({ ...testMetrics, sessionFile: 'test.json' }, testContext),
      ).resolves.not.toThrow();
    });
  });
});
