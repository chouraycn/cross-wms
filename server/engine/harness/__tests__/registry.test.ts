/**
 * Harness Registry 单元测试
 *
 * 覆盖：
 * - 线束注册/获取/列表
 * - 线束清除与恢复
 * - 会话重置
 * - 资源释放
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  registerAgentHarness,
  getRegisteredAgentHarness,
  listRegisteredAgentHarnesses,
  clearAgentHarnesses,
  restoreRegisteredHarnesses,
  resetRegisteredHarnessSessions,
  disposeRegisteredHarnesses,
} from '../registry.js';
import type { AgentHarness } from '../types.js';

function createMockHarness(id: string, options: Partial<AgentHarness> = {}): AgentHarness {
  return {
    id,
    name: `Test Harness ${id}`,
    priority: 0,
    supports: vi.fn().mockReturnValue({ supported: true, priority: 0, reason: 'test' }),
    run: vi.fn().mockResolvedValue({ text: 'result' }),
    compact: vi.fn().mockResolvedValue({ summary: 'compact', originalCount: 10, compactedCount: 3 }),
    reset: vi.fn(),
    dispose: vi.fn(),
    ...options,
  };
}

describe('Harness Registry — 线束注册表', () => {
  beforeEach(() => {
    clearAgentHarnesses();
  });

  // 1
  describe('注册与获取', () => {
    it('应能注册线束', () => {
      const harness = createMockHarness('test-harness');
      registerAgentHarness(harness);

      const found = getRegisteredAgentHarness('test-harness');
      expect(found).toBeDefined();
      expect(found?.harness.id).toBe('test-harness');
    });

    // 2
    it('注册时应裁剪 id 空白', () => {
      const harness = createMockHarness('  spaced-id  ');
      registerAgentHarness(harness);

      const found = getRegisteredAgentHarness('spaced-id');
      expect(found).toBeDefined();
    });

    // 3
    it('应能获取已注册的线束', () => {
      registerAgentHarness(createMockHarness('h1'));
      registerAgentHarness(createMockHarness('h2'));

      expect(getRegisteredAgentHarness('h1')).toBeDefined();
      expect(getRegisteredAgentHarness('h2')).toBeDefined();
      expect(getRegisteredAgentHarness('h3')).toBeUndefined();
    });

    // 4
    it('listRegisteredAgentHarnesses 应返回所有已注册线束', () => {
      registerAgentHarness(createMockHarness('h1'));
      registerAgentHarness(createMockHarness('h2'));
      registerAgentHarness(createMockHarness('h3'));

      const list = listRegisteredAgentHarnesses();
      expect(list.length).toBe(3);
    });

    // 5
    it('重新注册同 id 线束应替换旧的', () => {
      const h1 = createMockHarness('same-id', { name: 'First' });
      const h2 = createMockHarness('same-id', { name: 'Second' });

      registerAgentHarness(h1);
      registerAgentHarness(h2);

      const found = getRegisteredAgentHarness('same-id');
      expect(found?.harness.name).toBe('Second');
    });

    // 6
    it('应支持 ownerPluginId 选项', () => {
      const harness = createMockHarness('plugin-harness');
      registerAgentHarness(harness, { ownerPluginId: 'my-plugin' });

      const found = getRegisteredAgentHarness('plugin-harness');
      expect(found?.ownerPluginId).toBe('my-plugin');
      expect(found?.harness.pluginId).toBe('my-plugin');
    });
  });

  // 7
  describe('清除与恢复', () => {
    it('clearAgentHarnesses 应清除所有线束', () => {
      registerAgentHarness(createMockHarness('h1'));
      registerAgentHarness(createMockHarness('h2'));
      expect(listRegisteredAgentHarnesses().length).toBe(2);

      clearAgentHarnesses();
      expect(listRegisteredAgentHarnesses().length).toBe(0);
    });

    // 8
    it('restoreRegisteredHarnesses 应恢复线束快照', () => {
      registerAgentHarness(createMockHarness('h1'));
      const snapshot = listRegisteredAgentHarnesses();

      clearAgentHarnesses();
      expect(listRegisteredAgentHarnesses().length).toBe(0);

      restoreRegisteredHarnesses(snapshot);
      expect(listRegisteredAgentHarnesses().length).toBe(1);
      expect(getRegisteredAgentHarness('h1')).toBeDefined();
    });

    // 9
    it('restoreRegisteredHarnesses 应先清除再恢复', () => {
      registerAgentHarness(createMockHarness('old'));

      const newHarness = createMockHarness('new');
      restoreRegisteredHarnesses([{ harness: newHarness, ownerPluginId: undefined }]);

      const list = listRegisteredAgentHarnesses();
      expect(list.length).toBe(1);
      expect(list[0].harness.id).toBe('new');
    });
  });

  // 10
  describe('会话重置', () => {
    it('resetRegisteredHarnessSessions 应调用所有线束的 reset', async () => {
      const h1 = createMockHarness('h1');
      const h2 = createMockHarness('h2');

      registerAgentHarness(h1);
      registerAgentHarness(h2);

      await resetRegisteredHarnessSessions({ sessionId: 'session-1' });

      expect(h1.reset).toHaveBeenCalledTimes(1);
      expect(h2.reset).toHaveBeenCalledTimes(1);
      expect((h1.reset as unknown).mock.calls[0][0].sessionId).toBe('session-1');
    });

    // 11
    it('没有 reset 方法的线束应被跳过', async () => {
      const harness = createMockHarness('no-reset', { reset: undefined });
      registerAgentHarness(harness);

      await expect(
        resetRegisteredHarnessSessions({ sessionId: 's1' }),
      ).resolves.not.toThrow();
    });

    // 12
    it('线束 reset 抛出错误不应影响其他线束', async () => {
      const goodHarness = createMockHarness('good');
      const badHarness = createMockHarness('bad', {
        reset: vi.fn().mockRejectedValue(new Error('reset failed')),
      });

      registerAgentHarness(goodHarness);
      registerAgentHarness(badHarness);

      await expect(
        resetRegisteredHarnessSessions({ sessionId: 's1' }),
      ).resolves.not.toThrow();

      expect(goodHarness.reset).toHaveBeenCalled();
    });
  });

  // 13
  describe('资源释放', () => {
    it('disposeRegisteredHarnesses 应调用所有线束的 dispose', async () => {
      const h1 = createMockHarness('h1');
      const h2 = createMockHarness('h2');

      registerAgentHarness(h1);
      registerAgentHarness(h2);

      await disposeRegisteredHarnesses();

      expect(h1.dispose).toHaveBeenCalledTimes(1);
      expect(h2.dispose).toHaveBeenCalledTimes(1);
    });

    // 14
    it('没有 dispose 方法的线束应被跳过', async () => {
      const harness = createMockHarness('no-dispose', { dispose: undefined });
      registerAgentHarness(harness);

      await expect(disposeRegisteredHarnesses()).resolves.not.toThrow();
    });

    // 15
    it('线束 dispose 抛出错误不应影响其他线束', async () => {
      const goodHarness = createMockHarness('good');
      const badHarness = createMockHarness('bad', {
        dispose: vi.fn().mockRejectedValue(new Error('dispose failed')),
      });

      registerAgentHarness(goodHarness);
      registerAgentHarness(badHarness);

      await expect(disposeRegisteredHarnesses()).resolves.not.toThrow();
      expect(goodHarness.dispose).toHaveBeenCalled();
    });
  });
});
