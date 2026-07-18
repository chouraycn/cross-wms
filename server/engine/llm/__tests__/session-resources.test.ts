/**
 * session-resources 测试 — 会话资源清理钩子注册与执行。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerSessionResourceCleanup,
  registerScopedSessionResourceCleanup,
  cleanupSessionResources,
  cleanupSession,
  listActiveSessions,
  countSessionCleanups,
  clearAllSessionCleanups,
  createTrackedAbortController,
  trackReader,
} from '../session-resources.js';

describe('registerSessionResourceCleanup / cleanupSessionResources', () => {
  beforeEach(() => {
    clearAllSessionCleanups();
  });

  it('注册的清理钩子在 cleanup 时被调用', () => {
    let cleaned = false;
    const unregister = registerSessionResourceCleanup(() => {
      cleaned = true;
    });
    cleanupSessionResources();
    expect(cleaned).toBe(true);
    unregister();
  });

  it('反注册后不再被调用', () => {
    let called = false;
    const unregister = registerSessionResourceCleanup(() => {
      called = true;
    });
    unregister();
    cleanupSessionResources();
    expect(called).toBe(false);
  });

  it('单个钩子抛错不阻塞其他钩子', () => {
    let secondCalled = false;
    registerSessionResourceCleanup(() => {
      throw new Error('hook-1-failed');
    });
    registerSessionResourceCleanup(() => {
      secondCalled = true;
    });
    const result = cleanupSessionResources();
    expect(secondCalled).toBe(true);
    expect(result.failures).toBe(1);
    expect(result.success).toBe(1);
  });
});

describe('registerScopedSessionResourceCleanup', () => {
  beforeEach(() => {
    clearAllSessionCleanups();
  });

  it('作用域钩子仅在 cleanupSession 时触发', () => {
    let called = false;
    registerScopedSessionResourceCleanup('sess-1', () => {
      called = true;
    });
    // 全局清理不应触发作用域钩子
    cleanupSessionResources();
    expect(called).toBe(false);
    // 指定 sessionId 触发
    cleanupSession('sess-1');
    expect(called).toBe(true);
  });

  it('listActiveSessions 返回已注册的 sessionId', () => {
    registerScopedSessionResourceCleanup('a', () => {});
    registerScopedSessionResourceCleanup('b', () => {});
    expect(listActiveSessions()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('cleanupSession 后从 active 列表移除', () => {
    registerScopedSessionResourceCleanup('sess-x', () => {});
    cleanupSession('sess-x');
    expect(listActiveSessions()).not.toContain('sess-x');
  });
});

describe('countSessionCleanups', () => {
  beforeEach(() => {
    clearAllSessionCleanups();
  });

  it('统计全局与作用域钩子数量', () => {
    registerSessionResourceCleanup(() => {});
    registerSessionResourceCleanup(() => {});
    registerScopedSessionResourceCleanup('s1', () => {});
    registerScopedSessionResourceCleanup('s1', () => {});
    registerScopedSessionResourceCleanup('s2', () => {});
    const counts = countSessionCleanups();
    expect(counts.global).toBe(2);
    expect(counts.scoped).toBe(3);
  });
});

describe('createTrackedAbortController', () => {
  beforeEach(() => {
    clearAllSessionCleanups();
  });

  it('cleanup 时自动 abort', () => {
    const { controller, cleanup } = createTrackedAbortController();
    cleanup();
    expect(controller.signal.aborted).toBe(true);
  });

  it('带 sessionId 的控制器在 cleanupSession 时被 abort', () => {
    const { controller } = createTrackedAbortController('sess-abort');
    expect(controller.signal.aborted).toBe(false);
    cleanupSession('sess-abort');
    expect(controller.signal.aborted).toBe(true);
  });

  it('手动 cleanup 后不会重复 abort', () => {
    const { controller, cleanup } = createTrackedAbortController();
    cleanup();
    expect(controller.signal.aborted).toBe(true);
    // 再次调用不应抛错
    expect(() => cleanup()).not.toThrow();
  });
});

describe('trackReader', () => {
  beforeEach(() => {
    clearAllSessionCleanups();
  });

  it('cleanup 时调用 reader.cancel', () => {
    let cancelled = false;
    const reader = {
      cancel: async () => {
        cancelled = true;
      },
    };
    const unregister = trackReader(reader);
    cleanupSessionResources();
    expect(cancelled).toBe(true);
    unregister();
  });

  it('带 sessionId 的 reader 在 cleanupSession 时取消', () => {
    let cancelled = false;
    const reader = {
      cancel: async () => {
        cancelled = true;
      },
    };
    trackReader(reader, 'sess-reader');
    cleanupSessionResources(); // 不应触发
    expect(cancelled).toBe(false);
    cleanupSession('sess-reader');
    expect(cancelled).toBe(true);
  });
});

describe('clearAllSessionCleanups', () => {
  it('清空所有钩子', () => {
    registerSessionResourceCleanup(() => {});
    registerScopedSessionResourceCleanup('x', () => {});
    clearAllSessionCleanups();
    const counts = countSessionCleanups();
    expect(counts.global).toBe(0);
    expect(counts.scoped).toBe(0);
    expect(listActiveSessions()).toHaveLength(0);
  });
});
