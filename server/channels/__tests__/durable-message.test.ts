import { describe, it, expect, beforeEach } from 'vitest';
import { DurableMessageManager } from '../message/durable-message.js';
import type { DurableMessageStore, DurableMessage } from '../message/durable-message.js';

class MockDurableMessageStore implements DurableMessageStore {
  private messages = new Map<string, DurableMessage>();

  async save(message: DurableMessage): Promise<void> {
    this.messages.set(message.id, { ...message });
  }

  async get(id: string): Promise<DurableMessage | undefined> {
    const msg = this.messages.get(id);
    return msg ? { ...msg } : undefined;
  }

  async update(message: DurableMessage): Promise<void> {
    this.messages.set(message.id, { ...message });
  }

  async delete(id: string): Promise<void> {
    this.messages.delete(id);
  }

  async listByStatus(status: DurableMessage['status']): Promise<DurableMessage[]> {
    return Array.from(this.messages.values()).filter((m) => m.status === status);
  }

  async listByChannel(channelId: string): Promise<DurableMessage[]> {
    return Array.from(this.messages.values()).filter((m) => m.channelId === channelId);
  }

  async listPending(): Promise<DurableMessage[]> {
    return this.listByStatus('pending');
  }

  async cleanupOldMessages(maxAgeMs: number): Promise<number> {
    const now = Date.now();
    let deleted = 0;
    for (const [id, message] of this.messages.entries()) {
      if (now - message.createdAt > maxAgeMs) {
        this.messages.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  clear(): void {
    this.messages.clear();
  }

  size(): number {
    return this.messages.size;
  }
}

describe('DurableMessageManager', () => {
  let store: MockDurableMessageStore;
  let manager: DurableMessageManager;

  beforeEach(() => {
    store = new MockDurableMessageStore();
    manager = new DurableMessageManager(store, {
      maxAttempts: 3,
      retryDelayMs: 100,
      maxMessageAgeMs: 1000,
    });
  });

  describe('createMessage', () => {
    it('应能创建消息并保存', async () => {
      const message = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello',
        strategy: 'required',
      });

      expect(message.id).toBeDefined();
      expect(message.status).toBe('pending');
      expect(message.attempts).toBe(0);
      expect(message.maxAttempts).toBe(3);
      expect(message.channelId).toBe('web');
      expect(message.to).toBe('user-1');
      expect(message.content).toBe('Hello');
      expect(message.strategy).toBe('required');

      const stored = await store.get(message.id);
      expect(stored).toBeDefined();
    });

    it('应能创建带 accountId 和 metadata 的消息', async () => {
      const message = await manager.createMessage({
        channelId: 'feishu',
        accountId: 'acc-1',
        to: 'group-1',
        content: 'Hello Feishu',
        strategy: 'best_effort',
        metadata: { priority: 'high' },
      });

      expect(message.accountId).toBe('acc-1');
      expect(message.metadata).toEqual({ priority: 'high' });
    });

    it('应生成唯一的消息 ID', async () => {
      const msg1 = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello',
        strategy: 'required',
      });
      const msg2 = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'World',
        strategy: 'required',
      });

      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  describe('updateStatus', () => {
    it('应能更新为 sent 状态', async () => {
      const message = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello',
        strategy: 'required',
      });

      await manager.markAsSent(message.id, {
        messageId: 'ext-1',
        deliveredAt: Date.now(),
      });

      const updated = await manager.getMessage(message.id);
      expect(updated?.status).toBe('sent');
      expect(updated?.receipt?.messageId).toBe('ext-1');
    });

    it('应能更新为 failed 状态并增加 attempts', async () => {
      const message = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello',
        strategy: 'required',
      });

      await manager.markAsFailed(message.id, 'Network error');

      const updated = await manager.getMessage(message.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.attempts).toBe(1);
      expect(updated?.error).toBe('Network error');
    });

    it('应能更新为 suppressed 状态', async () => {
      const message = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello',
        strategy: 'required',
      });

      await manager.markAsSuppressed(message.id);

      const updated = await manager.getMessage(message.id);
      expect(updated?.status).toBe('suppressed');
    });

    it('更新不存在的消息应安全跳过', async () => {
      await expect(manager.markAsSent('nonexistent', { messageId: 'x' })).resolves.not.toThrow();
    });
  });

  describe('getMessage', () => {
    it('应能获取存在的消息', async () => {
      const message = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello',
        strategy: 'required',
      });

      const retrieved = await manager.getMessage(message.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(message.id);
    });

    it('不存在的消息应返回 undefined', async () => {
      const result = await manager.getMessage('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('listPendingMessages', () => {
    it('应能列出所有 pending 消息', async () => {
      const msg1 = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello 1',
        strategy: 'required',
      });
      await manager.createMessage({
        channelId: 'web',
        to: 'user-2',
        content: 'Hello 2',
        strategy: 'required',
      });
      await manager.markAsSent(msg1.id, { messageId: 'ext-1' });

      const pending = await manager.listPendingMessages();
      expect(pending).toHaveLength(1);
      expect(pending[0].content).toBe('Hello 2');
    });
  });

  describe('scheduleRetry', () => {
    it('应能重置状态为 pending', async () => {
      const message = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello',
        strategy: 'required',
      });

      await manager.markAsFailed(message.id, 'Network error');
      await manager.scheduleRetry(message.id);

      const updated = await manager.getMessage(message.id);
      expect(updated?.status).toBe('pending');
    });

    it('达到最大尝试次数应标记为 failed', async () => {
      const message = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello',
        strategy: 'required',
      });

      // 模拟达到最大尝试次数
      const msg = await manager.getMessage(message.id);
      if (msg) {
        msg.attempts = 3;
        await store.update(msg);
      }

      await manager.scheduleRetry(message.id);

      const updated = await manager.getMessage(message.id);
      expect(updated?.status).toBe('failed');
      expect(updated?.error).toContain('Max delivery');
    });

    it('不存在的消息应安全跳过', async () => {
      await expect(manager.scheduleRetry('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('getRetryDelay', () => {
    it('应随着尝试次数增加而增大延迟', async () => {
      const message = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Hello',
        strategy: 'required',
      });

      const delay1 = await manager.getRetryDelay({ ...message, attempts: 0 });
      const delay2 = await manager.getRetryDelay({ ...message, attempts: 1 });
      const delay3 = await manager.getRetryDelay({ ...message, attempts: 2 });

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });
  });

  describe('cleanup', () => {
    it('应能清理旧消息', async () => {
      const oldMessage = await manager.createMessage({
        channelId: 'web',
        to: 'user-1',
        content: 'Old',
        strategy: 'required',
      });

      // 手动调整创建时间
      const msg = await store.get(oldMessage.id);
      if (msg) {
        msg.createdAt = Date.now() - 2000;
        await store.update(msg);
      }

      await manager.cleanup();
      const result = await store.get(oldMessage.id);
      expect(result).toBeUndefined();
    });
  });
});