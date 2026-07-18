/**
 * session-manager 测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpSessionManager } from '../session-manager.js';
import { ResourceManager } from '../resource-manager.js';

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('McpSessionManager', () => {
  let manager: McpSessionManager;

  beforeEach(() => {
    manager = new McpSessionManager();
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('createSession', () => {
    it('应该创建新会话', () => {
      const session = manager.createSession('client-1');

      expect(session.id).toBeDefined();
      expect(session.clientId).toBe('client-1');
      expect(session.createdAt).toBeLessThanOrEqual(Date.now());
      expect(session.resources).toBeInstanceOf(ResourceManager);
    });

    it('应该支持元数据', () => {
      const session = manager.createSession('client-1', { userId: 'user-123' });

      expect(session.metadata).toEqual({ userId: 'user-123' });
    });

    it('应该维护客户端到会话的映射', () => {
      manager.createSession('client-1');
      manager.createSession('client-1');

      expect(manager.getClientSessionCount('client-1')).toBe(2);
    });
  });

  describe('getSession', () => {
    it('应该返回存在的会话', () => {
      const created = manager.createSession('client-1');
      const retrieved = manager.getSession(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('应该更新 lastActivityAt', async () => {
      const session = manager.createSession('client-1');
      const originalTime = session.lastActivityAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      manager.getSession(session.id);

      expect(session.lastActivityAt).toBeGreaterThan(originalTime);
    });

    it('应该返回 undefined 当会话不存在', () => {
      expect(manager.getSession('not-exist')).toBeUndefined();
    });
  });

  describe('closeSession', () => {
    it('应该关闭会话', () => {
      const session = manager.createSession('client-1');
      manager.closeSession(session.id);

      expect(manager.getSession(session.id)).toBeUndefined();
      expect(manager.getSessionCount()).toBe(0);
    });

    it('应该取消所有订阅', () => {
      const session = manager.createSession('client-1');
      const unsubscribe = vi.fn();

      session.subscriptions.set('resource-1', unsubscribe);
      manager.closeSession(session.id);

      expect(unsubscribe).toHaveBeenCalled();
    });

    it('应该清理会话资源', () => {
      const session = manager.createSession('client-1');
      session.resources.registerResource('test', () => ({ uri: 'test', text: 'test' }));

      manager.closeSession(session.id);

      expect(session.resources.getResourceCount()).toBe(0);
    });
  });

  describe('closeClientSessions', () => {
    it('应该关闭客户端的所有会话', () => {
      manager.createSession('client-1');
      manager.createSession('client-1');
      manager.createSession('client-2');

      manager.closeClientSessions('client-1');

      expect(manager.getClientSessionCount('client-1')).toBe(0);
      expect(manager.getSessionCount()).toBe(1);
    });
  });

  describe('getSessionCount', () => {
    it('应该返回会话总数', () => {
      manager.createSession('client-1');
      manager.createSession('client-1');
      manager.createSession('client-2');

      expect(manager.getSessionCount()).toBe(3);
    });
  });

  describe('listSessions', () => {
    it('应该列出所有会话', () => {
      const session1 = manager.createSession('client-1');
      const session2 = manager.createSession('client-2');

      const list = manager.listSessions();

      expect(list.length).toBe(2);
      expect(list.map((s) => s.id)).toContain(session1.id);
      expect(list.map((s) => s.id)).toContain(session2.id);
    });
  });

  describe('subscribeToResource', () => {
    it('应该在会话中订阅资源', () => {
      const session = manager.createSession('client-1');
      const globalManager = new ResourceManager();

      globalManager.registerResource('test', () => ({ uri: 'test', text: 'Test' }));

      manager.subscribeToResource(session.id, 'test', globalManager);

      expect(session.subscriptions.has('test')).toBe(true);
    });

    it('应该忽略不存在的会话', () => {
      const globalManager = new ResourceManager();
      globalManager.registerResource('test', () => ({ uri: 'test', text: 'Test' }));

      manager.subscribeToResource('not-exist', 'test', globalManager);
      // 不应该抛出错误
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('应该清理过期会话', () => {
      const session = manager.createSession('client-1');

      // 设置很短的超时时间
      manager.setSessionTimeout(10);

      // 等待会话过期
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          manager.cleanupExpiredSessions();
          expect(manager.getSessionCount()).toBe(0);
          resolve();
        }, 20);
      });
    });
  });

  describe('destroy', () => {
    it('应该销毁管理器', () => {
      manager.createSession('client-1');
      manager.destroy();

      expect(manager.getSessionCount()).toBe(0);
    });
  });
});