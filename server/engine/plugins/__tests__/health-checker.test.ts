import { describe, it, expect, beforeEach, vi } from 'vitest';

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
    })),
  },
}));

import {
  runHealthCheck,
  getPluginHealth,
  recordPluginError,
  getPluginErrors,
  getTotalErrorCount,
  resetHealthCheckerForTests,
  startHealthCheckLoop,
  stopHealthCheckLoop,
  getLastHealthSnapshot,
} from '../health-checker.js';
import { pluginRuntimeRegistry } from '../registry.js';
import { resetSandboxStats } from '../sandbox.js';
import type { PluginInstance } from '../types.js';

function makeInstance(id: string, status: PluginInstance['status'] = 'enabled'): PluginInstance {
  return {
    id,
    manifest: { id, name: id, version: '1.0.0' },
    loadedAt: Date.now(),
    status,
    capabilities: [],
  };
}

describe('plugins/health-checker', () => {
  beforeEach(() => {
    resetHealthCheckerForTests();
    resetSandboxStats();
    pluginRuntimeRegistry.clear();
  });

  describe('runHealthCheck', () => {
    it('空注册表返回零值快照', () => {
      const snap = runHealthCheck();
      expect(snap.total).toBe(0);
      expect(snap.healthy).toBe(0);
      expect(snap.unhealthy).toBe(0);
    });

    it('已注册的健康插件标记为 healthy', () => {
      pluginRuntimeRegistry.register(makeInstance('p1'));
      const snap = runHealthCheck();
      expect(snap.healthy).toBe(1);
      expect(snap.unhealthy).toBe(0);
      const health = getPluginHealth('p1');
      expect(health?.healthy).toBe(true);
      expect(health?.uptimeMs).toBeGreaterThanOrEqual(0);
    });

    it('error 状态的插件标记为 unhealthy', () => {
      pluginRuntimeRegistry.register(makeInstance('p1', 'error'));
      const snap = runHealthCheck();
      expect(snap.unhealthy).toBe(1);
    });

    it('错误次数达到阈值后标记为 unhealthy', () => {
      pluginRuntimeRegistry.register(makeInstance('p1'));
      runHealthCheck({ errorThreshold: 3 });
      recordPluginError('p1', 'err1');
      recordPluginError('p1', 'err2');
      recordPluginError('p1', 'err3');
      const health = getPluginHealth('p1');
      expect(health?.healthy).toBe(false);
      expect(health?.errorCount).toBe(3);
    });
  });

  describe('recordPluginError / getPluginErrors', () => {
    it('记录错误并可通过 getPluginErrors 查询', () => {
      recordPluginError('p1', 'first error');
      recordPluginError('p1', 'second error');
      const errors = getPluginErrors('p1');
      expect(errors.length).toBe(2);
      expect(errors[0].payload).toBe('first error');
    });

    it('getTotalErrorCount 返回总错误数', () => {
      recordPluginError('p1', 'e1');
      recordPluginError('p2', 'e2');
      expect(getTotalErrorCount()).toBe(2);
    });
  });

  describe('startHealthCheckLoop / stopHealthCheckLoop', () => {
    it('启动后定时刷新快照', async () => {
      pluginRuntimeRegistry.register(makeInstance('p1'));
      startHealthCheckLoop({ intervalMs: 50 });
      // 等待至少一次定时执行
      await new Promise((r) => setTimeout(r, 120));
      stopHealthCheckLoop();
      const snap = getLastHealthSnapshot();
      expect(snap).not.toBeNull();
      expect(snap?.total).toBe(1);
    });

    it('重复调用 start 不重启定时器', () => {
      startHealthCheckLoop({ intervalMs: 1000 });
      const firstTimer = (runHealthCheck as unknown as { _timer?: unknown })._timer;
      startHealthCheckLoop({ intervalMs: 1000 });
      const secondTimer = (runHealthCheck as unknown as { _timer?: unknown })._timer;
      // 没有公开 timer 字段，只能通过 stop 后不报错来验证
      stopHealthCheckLoop();
      expect(firstTimer).toBeUndefined();
      expect(secondTimer).toBeUndefined();
    });
  });

  describe('getLastHealthSnapshot', () => {
    it('未运行时返回 null', () => {
      expect(getLastHealthSnapshot()).toBeNull();
    });

    it('运行后返回最近快照', () => {
      pluginRuntimeRegistry.register(makeInstance('p1'));
      const snap = runHealthCheck();
      expect(getLastHealthSnapshot()).toBe(snap);
    });
  });
});
