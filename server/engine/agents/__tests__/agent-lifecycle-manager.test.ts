import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentLifecycleManager } from '../agent-lifecycle-manager.js';

describe('AgentLifecycleManager', () => {
  let manager: AgentLifecycleManager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new AgentLifecycleManager({ autoCleanupAfterDestroy: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getState', () => {
    it('未注册的 agent 默认返回 created', () => {
      expect(manager.getState('agent-1')).toBe('created');
    });

    it('注册后返回正确状态', () => {
      manager.setState('agent-1', 'initializing');
      expect(manager.getState('agent-1')).toBe('initializing');
    });
  });

  describe('setState', () => {
    it('合法转换应成功', () => {
      expect(manager.setState('agent-1', 'initializing')).toBe(true);
      expect(manager.getState('agent-1')).toBe('initializing');
    });

    it('非法转换应失败', () => {
      manager.setState('agent-1', 'initializing');
      expect(manager.setState('agent-1', 'running')).toBe(false); // initializing -> running 非法
    });

    it('从 created 直接到 destroyed 应成功', () => {
      expect(manager.setState('agent-1', 'destroyed')).toBe(true);
    });

    it('完整生命周期转换应成功', () => {
      expect(manager.setState('agent-1', 'initializing')).toBe(true);
      expect(manager.setState('agent-1', 'idle')).toBe(true);
      expect(manager.setState('agent-1', 'running')).toBe(true);
      expect(manager.setState('agent-1', 'paused')).toBe(true);
      expect(manager.setState('agent-1', 'running')).toBe(true);
      expect(manager.setState('agent-1', 'completed')).toBe(true);
      expect(manager.setState('agent-1', 'idle')).toBe(true);
    });

    it('带 reason 和 metadata 应保存到历史', () => {
      manager.setState('agent-1', 'initializing', '启动中', { source: 'test' });
      const history = manager.getHistory('agent-1');
      expect(history).toHaveLength(1);
      expect(history[0].reason).toBe('启动中');
      expect(history[0].metadata).toEqual({ source: 'test' });
    });
  });

  describe('getHistory', () => {
    it('未注册 agent 返回空数组', () => {
      expect(manager.getHistory('agent-1')).toEqual([]);
    });

    it('应返回所有转换事件', () => {
      manager.setState('agent-1', 'initializing');
      manager.setState('agent-1', 'idle');
      manager.setState('agent-1', 'running');
      const history = manager.getHistory('agent-1');
      expect(history).toHaveLength(3);
      expect(history[0].from).toBe('created');
      expect(history[0].to).toBe('initializing');
      expect(history[2].to).toBe('running');
    });

    it('应限制历史长度', () => {
      const smallManager = new AgentLifecycleManager({ maxHistoryLength: 2 });
      smallManager.setState('agent-1', 'initializing');
      smallManager.setState('agent-1', 'idle');
      smallManager.setState('agent-1', 'running');
      const history = smallManager.getHistory('agent-1');
      expect(history).toHaveLength(2);
      expect(history[0].to).toBe('idle');
      expect(history[1].to).toBe('running');
    });
  });

  describe('canTransition', () => {
    it('created -> initializing 应为 true', () => {
      expect(manager.canTransition('created', 'initializing')).toBe(true);
    });

    it('created -> running 应为 false', () => {
      expect(manager.canTransition('created', 'running')).toBe(false);
    });

    it('destroyed -> 任何 应为 false', () => {
      expect(manager.canTransition('destroyed', 'initializing')).toBe(false);
      expect(manager.canTransition('destroyed', 'running')).toBe(false);
    });
  });

  describe('isTerminalState', () => {
    it('destroyed 应为终态', () => {
      expect(manager.isTerminalState('destroyed')).toBe(true);
    });

    it('completed 应为终态', () => {
      expect(manager.isTerminalState('completed')).toBe(true);
    });

    it('failed 应为终态', () => {
      expect(manager.isTerminalState('failed')).toBe(true);
    });

    it('aborted 应为终态', () => {
      expect(manager.isTerminalState('aborted')).toBe(true);
    });

    it('running 不应为终态', () => {
      expect(manager.isTerminalState('running')).toBe(false);
    });
  });

  describe('isActiveState', () => {
    it('running 应为活跃状态', () => {
      expect(manager.isActiveState('running')).toBe(true);
    });

    it('paused 应为活跃状态', () => {
      expect(manager.isActiveState('paused')).toBe(true);
    });

    it('idle 不应为活跃状态', () => {
      expect(manager.isActiveState('idle')).toBe(false);
    });
  });

  describe('getActiveAgents', () => {
    it('应返回活跃的 agent', () => {
      manager.setState('agent-1', 'initializing');
      manager.setState('agent-1', 'idle');
      manager.setState('agent-1', 'running');

      manager.setState('agent-2', 'initializing');

      manager.setState('agent-3', 'initializing');
      manager.setState('agent-3', 'idle');
      manager.setState('agent-3', 'running');
      manager.setState('agent-3', 'paused');

      const active = manager.getActiveAgents();
      expect(active).toHaveLength(2);
      expect(active).toContain('agent-1');
      expect(active).toContain('agent-3');
      expect(active).not.toContain('agent-2');
    });
  });

  describe('getAllAgents', () => {
    it('应返回所有 agent 及其状态', () => {
      manager.setState('agent-1', 'initializing');
      manager.setState('agent-2', 'initializing');
      manager.setState('agent-2', 'idle');
      manager.setState('agent-2', 'running');

      const all = manager.getAllAgents();
      expect(all).toHaveLength(2);
      expect(all.find((a) => a.agentId === 'agent-1')?.state).toBe('initializing');
      expect(all.find((a) => a.agentId === 'agent-2')?.state).toBe('running');
    });
  });

  describe('hasAgent', () => {
    it('已注册应返回 true', () => {
      manager.setState('agent-1', 'initializing');
      expect(manager.hasAgent('agent-1')).toBe(true);
    });

    it('未注册应返回 false', () => {
      expect(manager.hasAgent('unknown')).toBe(false);
    });
  });

  describe('clear', () => {
    it('应清除 agent 状态和历史', () => {
      manager.setState('agent-1', 'initializing');
      manager.clear('agent-1');
      expect(manager.getState('agent-1')).toBe('created');
      expect(manager.getHistory('agent-1')).toEqual([]);
      expect(manager.hasAgent('agent-1')).toBe(false);
    });
  });

  describe('getStateSnapshot', () => {
    it('应返回所有状态的快照', () => {
      manager.setState('agent-1', 'initializing');
      manager.setState('agent-2', 'initializing');
      manager.setState('agent-2', 'idle');
      manager.setState('agent-2', 'running');

      const snapshot = manager.getStateSnapshot();
      expect(snapshot.size).toBe(2);
      expect(snapshot.get('agent-1')).toBe('initializing');
      expect(snapshot.get('agent-2')).toBe('running');
    });
  });

  describe('autoCleanupAfterDestroy', () => {
    it('destroyed 后应自动清理', () => {
      const autoManager = new AgentLifecycleManager({
        autoCleanupAfterDestroy: true,
        cleanupDelayMs: 1000,
      });
      autoManager.setState('agent-1', 'destroyed');
      expect(autoManager.hasAgent('agent-1')).toBe(true);

      vi.advanceTimersByTime(1001);
      expect(autoManager.hasAgent('agent-1')).toBe(false);
    });
  });
});