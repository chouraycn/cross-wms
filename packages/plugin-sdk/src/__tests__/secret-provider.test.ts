/**
 * SecretProvider 契约测试
 *
 * 覆盖密钥管理：
 * - 获取密钥
 * - 设置密钥
 * - 删除密钥
 * - 轮换密钥
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecretProvider } from '../secret-provider.js';
import type { SecretConfig } from '../types.js';

describe('SecretProvider Contract', () => {
  describe('get', () => {
    it('获取存在的密钥', () => {
      const provider = new SecretProvider();
      provider.set('test-key', 'test-value');

      const value = provider.get('test-key');
      expect(value).toBe('test-value');
    });

    it('获取不存在的密钥返回 null', () => {
      const provider = new SecretProvider();

      const value = provider.get('nonexistent');
      expect(value).toBeNull();
    });

    it('获取过期密钥返回 null', () => {
      const provider = new SecretProvider();
      provider.set('expired-key', 'value', {
        expiresAt: Date.now() - 1000,
      });

      const value = provider.get('expired-key');
      expect(value).toBeNull();
    });

    it('触发 secret_accessed 事件', () => {
      const provider = new SecretProvider();
      const handler = vi.fn();
      provider.on('secret_accessed', handler);

      provider.set('access-key', 'value');
      provider.get('access-key');

      expect(handler).toHaveBeenCalledWith('access-key');
    });
  });

  describe('set', () => {
    it('设置密钥', () => {
      const provider = new SecretProvider();
      provider.set('new-key', 'new-value');

      expect(provider.has('new-key')).toBe(true);
    });

    it('触发 secret_set 事件', () => {
      const provider = new SecretProvider();
      const handler = vi.fn();
      provider.on('secret_set', handler);

      provider.set('set-key', 'value');

      expect(handler).toHaveBeenCalledWith('set-key');
    });

    it('设置带过期时间的密钥', () => {
      const provider = new SecretProvider();
      const expiresAt = Date.now() + 10000;

      provider.set('expiring-key', 'value', { expiresAt });

      const status = provider.getStatus('expiring-key');
      expect(status.expiresAt).toBe(expiresAt);
    });

    it('设置带轮换策略的密钥', () => {
      const provider = new SecretProvider();

      provider.set('rotating-key', 'value', {
        rotationPolicy: {
          enabled: true,
          algorithm: 'random',
        },
      });

      const status = provider.getStatus('rotating-key');
      expect(status.exists).toBe(true);
    });
  });

  describe('delete', () => {
    it('删除存在的密钥', () => {
      const provider = new SecretProvider();
      provider.set('del-key', 'value');
      provider.delete('del-key');

      expect(provider.has('del-key')).toBe(false);
    });

    it('触发 secret_deleted 事件', () => {
      const provider = new SecretProvider();
      const handler = vi.fn();
      provider.on('secret_deleted', handler);

      provider.set('delete-key', 'value');
      provider.delete('delete-key');

      expect(handler).toHaveBeenCalledWith('delete-key');
    });

    it('删除不存在的密钥不报错', () => {
      const provider = new SecretProvider();
      expect(() => provider.delete('nonexistent')).not.toThrow();
    });
  });

  describe('rotate', () => {
    it('轮换密钥生成新值', () => {
      const provider = new SecretProvider();
      provider.set('rotate-key', 'original-value');

      const original = provider.get('rotate-key');
      provider.rotate('rotate-key');
      const rotated = provider.get('rotate-key');

      expect(rotated).not.toBe(original);
      expect(rotated).toBeTruthy();
    });

    it('轮换不存在的密钥抛出错误', () => {
      const provider = new SecretProvider();
      expect(() => provider.rotate('nonexistent')).toThrow('not found');
    });

    it('触发 secret_rotated 事件', () => {
      const provider = new SecretProvider();
      const handler = vi.fn();
      provider.on('secret_rotated', handler);

      provider.set('rot-key', 'value');
      provider.rotate('rot-key');

      expect(handler).toHaveBeenCalledWith('rot-key');
    });

    it('更新 lastRotated 时间', () => {
      const provider = new SecretProvider();
      provider.set('rot-time-key', 'value');

      const before = Date.now();
      provider.rotate('rot-time-key');

      const status = provider.getStatus('rot-time-key');
      expect(status.lastRotated).toBeGreaterThanOrEqual(before);
    });
  });

  describe('has', () => {
    it('检查存在的密钥', () => {
      const provider = new SecretProvider();
      provider.set('has-key', 'value');

      expect(provider.has('has-key')).toBe(true);
    });

    it('检查不存在的密钥', () => {
      const provider = new SecretProvider();
      expect(provider.has('nonexistent')).toBe(false);
    });

    it('检查过期密钥返回 false', () => {
      const provider = new SecretProvider();
      provider.set('expired-has', 'value', {
        expiresAt: Date.now() - 1000,
      });

      expect(provider.has('expired-has')).toBe(false);
    });
  });

  describe('getStatus', () => {
    it('返回密钥状态', () => {
      const provider = new SecretProvider();
      provider.set('status-key', 'value');

      const status = provider.getStatus('status-key');

      expect(status.key).toBe('status-key');
      expect(status.exists).toBe(true);
    });

    it('返回不存在的密钥状态', () => {
      const provider = new SecretProvider();

      const status = provider.getStatus('nonexistent');

      expect(status.exists).toBe(false);
    });
  });

  describe('listKeys', () => {
    it('列出所有密钥名称', () => {
      const provider = new SecretProvider();

      provider.set('key1', 'value1');
      provider.set('key2', 'value2');

      const keys = provider.listKeys();

      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
    });
  });

  describe('cleanup', () => {
    it('清理过期密钥', () => {
      const provider = new SecretProvider();

      provider.set('active-key', 'value');
      provider.set('expired-key', 'value', {
        expiresAt: Date.now() - 1000,
      });

      const removed = provider.cleanup();

      expect(removed).toBe(1);
      expect(provider.has('expired-key')).toBe(false);
      expect(provider.has('active-key')).toBe(true);
    });
  });

  describe('clear', () => {
    it('清空所有密钥', () => {
      const provider = new SecretProvider();

      provider.set('clear1', 'value1');
      provider.set('clear2', 'value2');

      provider.clear();

      expect(provider.size()).toBe(0);
    });
  });

  describe('size', () => {
    it('返回密钥数量', () => {
      const provider = new SecretProvider();

      expect(provider.size()).toBe(0);

      provider.set('size-key', 'value');
      expect(provider.size()).toBe(1);
    });
  });
});