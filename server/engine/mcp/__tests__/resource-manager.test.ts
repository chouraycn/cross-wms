/**
 * resource-manager 测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('ResourceManager', () => {
  let manager: ResourceManager;

  beforeEach(() => {
    manager = new ResourceManager();
  });

  describe('registerResource', () => {
    it('应该成功注册静态资源', () => {
      manager.registerResource('file:///test.txt', () => ({
        uri: 'file:///test.txt',
        text: 'Hello, World!',
      }));

      expect(manager.hasResource('file:///test.txt')).toBe(true);
      expect(manager.getResourceCount()).toBe(1);
    });

    it('应该成功注册动态资源', () => {
      manager.registerResource(
        'dynamic:///counter',
        () => ({
          uri: 'dynamic:///counter',
          text: `Count: ${Date.now()}`,
        }),
        { type: 'dynamic' },
      );

      const info = manager.getResourceInfo('dynamic:///counter');
      expect(info?.type).toBe('dynamic');
    });

    it('应该支持自定义元信息', () => {
      manager.registerResource(
        'file:///config.json',
        () => ({ uri: 'file:///config.json', text: '{}' }),
        { name: 'Config File', description: 'Application config', mimeType: 'application/json' },
      );

      const info = manager.getResourceInfo('file:///config.json');
      expect(info?.name).toBe('Config File');
      expect(info?.description).toBe('Application config');
      expect(info?.mimeType).toBe('application/json');
    });
  });

  describe('getResource', () => {
    it('应该返回资源内容', async () => {
      manager.registerResource('file:///test.txt', () => ({
        uri: 'file:///test.txt',
        text: 'Test content',
      }));

      const content = await manager.getResource('file:///test.txt');
      expect(content.uri).toBe('file:///test.txt');
      expect(content.text).toBe('Test content');
    });

    it('应该抛出错误当资源不存在', async () => {
      await expect(manager.getResource('file:///not-exist.txt')).rejects.toThrow(
        'Resource not found',
      );
    });

    it('应该支持异步处理器', async () => {
      manager.registerResource('file:///async.txt', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { uri: 'file:///async.txt', text: 'Async content' };
      });

      const content = await manager.getResource('file:///async.txt');
      expect(content.text).toBe('Async content');
    });
  });

  describe('listResources', () => {
    it('应该返回空数组当没有资源', () => {
      expect(manager.listResources()).toEqual([]);
    });

    it('应该列出所有资源', () => {
      manager.registerResource('file:///a.txt', () => ({ uri: 'file:///a.txt', text: 'A' }));
      manager.registerResource('file:///b.txt', () => ({ uri: 'file:///b.txt', text: 'B' }));

      const list = manager.listResources();
      expect(list.length).toBe(2);
      expect(list.map((r) => r.uri)).toContain('file:///a.txt');
      expect(list.map((r) => r.uri)).toContain('file:///b.txt');
    });
  });

  describe('subscribe', () => {
    it('应该成功订阅资源', () => {
      manager.registerResource('file:///test.txt', () => ({
        uri: 'file:///test.txt',
        text: 'Test',
      }));

      const callback = vi.fn();
      const unsubscribe = manager.subscribe('file:///test.txt', callback);

      expect(manager.getSubscriptionCount('file:///test.txt')).toBe(1);
      unsubscribe();
      expect(manager.getSubscriptionCount('file:///test.txt')).toBe(0);
    });

    it('应该返回空函数当订阅不存在的资源', () => {
      const callback = vi.fn();
      const unsubscribe = manager.subscribe('file:///not-exist.txt', callback);
      expect(unsubscribe).toBeInstanceOf(Function);
    });
  });

  describe('unsubscribe', () => {
    it('应该清除所有订阅', () => {
      manager.registerResource('file:///test.txt', () => ({
        uri: 'file:///test.txt',
        text: 'Test',
      }));

      manager.subscribe('file:///test.txt', vi.fn());
      manager.subscribe('file:///test.txt', vi.fn());

      expect(manager.getSubscriptionCount('file:///test.txt')).toBe(2);
      manager.unsubscribe('file:///test.txt');
      expect(manager.getSubscriptionCount('file:///test.txt')).toBe(0);
    });
  });

  describe('notifyUpdate', () => {
    it('应该通知所有订阅者', async () => {
      manager.registerResource('file:///test.txt', () => ({
        uri: 'file:///test.txt',
        text: 'Test',
      }));

      const callback1 = vi.fn();
      const callback2 = vi.fn();
      manager.subscribe('file:///test.txt', callback1);
      manager.subscribe('file:///test.txt', callback2);

      await manager.notifyUpdate('file:///test.txt');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('应该通知全局订阅者', async () => {
      manager.registerResource('file:///test.txt', () => ({
        uri: 'file:///test.txt',
        text: 'Test',
      }));

      const globalCallback = vi.fn();
      manager.subscribeGlobal(globalCallback);

      await manager.notifyUpdate('file:///test.txt');

      expect(globalCallback).toHaveBeenCalledWith('file:///test.txt', expect.any(Object));
    });
  });

  describe('unregisterResource', () => {
    it('应该移除资源', () => {
      manager.registerResource('file:///test.txt', () => ({
        uri: 'file:///test.txt',
        text: 'Test',
      }));

      expect(manager.hasResource('file:///test.txt')).toBe(true);
      manager.unregisterResource('file:///test.txt');
      expect(manager.hasResource('file:///test.txt')).toBe(false);
    });

    it('应该清除订阅', () => {
      manager.registerResource('file:///test.txt', () => ({
        uri: 'file:///test.txt',
        text: 'Test',
      }));

      manager.subscribe('file:///test.txt', vi.fn());
      manager.unregisterResource('file:///test.txt');

      expect(manager.getSubscriptionCount('file:///test.txt')).toBe(0);
    });
  });

  describe('clear', () => {
    it('应该清空所有资源', () => {
      manager.registerResource('file:///a.txt', () => ({ uri: 'file:///a.txt', text: 'A' }));
      manager.registerResource('file:///b.txt', () => ({ uri: 'file:///b.txt', text: 'B' }));

      manager.clear();
      expect(manager.getResourceCount()).toBe(0);
    });
  });
});