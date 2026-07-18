import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AgentSandbox,
  createAgentSandbox,
  getAgentSandbox,
  clearAgentSandboxes,
} from '../sandbox.js';

describe('AgentSandbox', () => {
  beforeEach(() => {
    clearAgentSandboxes();
  });

  describe('构造函数', () => {
    it('应使用默认配置', () => {
      const sandbox = new AgentSandbox({ agentId: 'test' });
      expect(sandbox.agentId).toBe('test');
      expect(sandbox.timeoutMs).toBe(30000);
      expect(sandbox.maxMemoryMB).toBe(512);
      expect(sandbox.maxCpuTimeMs).toBe(10000);
      expect(sandbox.blockedApis.size).toBeGreaterThan(0);
    });

    it('应接受自定义配置', () => {
      const sandbox = new AgentSandbox({
        agentId: 'test',
        timeoutMs: 5000,
        maxMemoryMB: 256,
        maxCpuTimeMs: 5000,
        blockedApis: ['eval', 'require'],
      });
      expect(sandbox.timeoutMs).toBe(5000);
      expect(sandbox.maxMemoryMB).toBe(256);
      expect(sandbox.blockedApis.has('eval')).toBe(true);
    });
  });

  describe('runInSandbox', () => {
    it('应正常执行安全函数', async () => {
      const sandbox = new AgentSandbox({ agentId: 'test' });
      const result = await sandbox.runInSandbox(() => 42);
      expect(result).toBe(42);
    });

    it('应捕获函数内部异常', async () => {
      const sandbox = new AgentSandbox({ agentId: 'test' });
      await expect(
        sandbox.runInSandbox(() => {
          throw new Error('内部错误');
        }),
      ).rejects.toThrow('内部错误');
    });

    it('应阻止包含被禁用 API 的函数', async () => {
      const sandbox = new AgentSandbox({ agentId: 'test' });
      await expect(
        sandbox.runInSandbox(() => {
          // eslint-disable-next-line no-eval
          eval('1+1');
          return 0;
        }),
      ).rejects.toThrow('沙箱安全策略阻止');
    });

    it('应在超时后拒绝', async () => {
      vi.useFakeTimers();
      const sandbox = new AgentSandbox({ agentId: 'test', timeoutMs: 100 });
      const promise = sandbox.runInSandbox(() => {
        // 模拟耗时操作，使用 setTimeout 让出事件循环
        return new Promise<number>((resolve) => {
          setTimeout(() => resolve(0), 5000);
        });
      });
      vi.advanceTimersByTime(150);
      await expect(promise).rejects.toThrow('沙箱执行超时');
      vi.useRealTimers();
    });
  });

  describe('isApiAllowed', () => {
    it('应允许未禁用的 API', () => {
      const sandbox = new AgentSandbox({ agentId: 'test' });
      expect(sandbox.isApiAllowed('console.log')).toBe(true);
    });

    it('应拒绝禁用的 API', () => {
      const sandbox = new AgentSandbox({ agentId: 'test' });
      expect(sandbox.isApiAllowed('eval')).toBe(false);
    });
  });

  describe('运行时存储', () => {
    it('createAgentSandbox 和 getAgentSandbox', () => {
      const sandbox = createAgentSandbox('agent-1', { timeoutMs: 10000 });
      expect(getAgentSandbox('agent-1')).toBe(sandbox);
    });

    it('clearAgentSandboxes 应清空所有沙箱', () => {
      createAgentSandbox('a');
      createAgentSandbox('b');
      clearAgentSandboxes();
      expect(getAgentSandbox('a')).toBeUndefined();
      expect(getAgentSandbox('b')).toBeUndefined();
    });
  });
});
