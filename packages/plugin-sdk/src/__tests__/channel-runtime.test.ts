/**
 * ChannelRuntime 契约测试
 *
 * 覆盖频道生命周期管理：
 * - 创建频道
 * - 销毁频道
 * - 获取频道状态
 * - 支持能力检查（typing、pairing、reply、websocket）
 */

import { describe, it, expect, vi } from 'vitest';
import { ChannelRuntime } from '../channel-runtime.js';
import type { ChannelConfig, ChannelState } from '../types.js';

describe('ChannelRuntime Contract', () => {
  describe('createChannel', () => {
    it('创建频道并返回实例', async () => {
      const runtime = new ChannelRuntime();
      const config: ChannelConfig = {
        id: 'test-channel-1',
        type: 'im',
      };

      const channel = await runtime.createChannel(config);

      expect(channel.id).toBe('test-channel-1');
      expect(channel.type).toBe('im');
      expect(channel.state).toBe('active');
    });

    it('重复创建相同 ID 的频道抛出错误', async () => {
      const runtime = new ChannelRuntime();
      const config: ChannelConfig = {
        id: 'dup-channel',
        type: 'webhook',
      };

      await runtime.createChannel(config);
      await expect(runtime.createChannel(config)).rejects.toThrow('already exists');
    });

    it('触发 channel_created 事件', async () => {
      const runtime = new ChannelRuntime();
      const handler = vi.fn();
      runtime.on('channel_created', handler);

      const config: ChannelConfig = { id: 'evt-channel', type: 'email' };
      await runtime.createChannel(config);

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].id).toBe('evt-channel');
    });

    it('触发 channel_state_changed 事件', async () => {
      const runtime = new ChannelRuntime();
      const handler = vi.fn();
      runtime.on('channel_state_changed', handler);

      const config: ChannelConfig = { id: 'state-channel', type: 'sms' };
      await runtime.createChannel(config);

      expect(handler).toHaveBeenCalledWith('state-channel', 'active');
    });
  });

  describe('destroyChannel', () => {
    it('销毁已存在的频道', async () => {
      const runtime = new ChannelRuntime();
      const config: ChannelConfig = { id: 'destroy-test', type: 'cli' };

      await runtime.createChannel(config);
      await runtime.destroyChannel('destroy-test');

      expect(runtime.getChannel('destroy-test')).toBeUndefined();
    });

    it('销毁不存在的频道不报错', async () => {
      const runtime = new ChannelRuntime();
      await expect(runtime.destroyChannel('nonexistent')).resolves.not.toThrow();
    });

    it('销毁后状态变为 destroyed', async () => {
      const runtime = new ChannelRuntime();
      const config: ChannelConfig = { id: 'state-destroy', type: 'im' };

      await runtime.createChannel(config);
      await runtime.destroyChannel('state-destroy');

      expect(runtime.getChannelState('state-destroy')).toBe('destroyed');
    });
  });

  describe('getChannelState', () => {
    it('返回活跃频道的 active 状态', async () => {
      const runtime = new ChannelRuntime();
      const config: ChannelConfig = { id: 'active-check', type: 'im' };

      await runtime.createChannel(config);
      expect(runtime.getChannelState('active-check')).toBe('active');
    });

    it('不存在的频道返回 destroyed 状态', () => {
      const runtime = new ChannelRuntime();
      expect(runtime.getChannelState('nonexistent')).toBe('destroyed');
    });
  });

  describe('supports 能力检查', () => {
    it('检查 typing 能力', async () => {
      const runtime = new ChannelRuntime();
      const config: ChannelConfig = {
        id: 'typing-channel',
        type: 'im',
        supports: { typing: true },
      };

      await runtime.createChannel(config);
      expect(runtime.supports('typing-channel', 'typing')).toBe(true);
      expect(runtime.supports('typing-channel', 'websocket')).toBe(false);
    });

    it('检查 reply 能力（默认支持）', async () => {
      const runtime = new ChannelRuntime();
      const config: ChannelConfig = { id: 'reply-channel', type: 'im' };

      await runtime.createChannel(config);
      expect(runtime.supports('reply-channel', 'reply')).toBe(true);
    });

    it('检查不存在的频道能力返回 false', () => {
      const runtime = new ChannelRuntime();
      expect(runtime.supports('nonexistent', 'reply')).toBe(false);
    });
  });

  describe('频道消息发送', () => {
    it('活跃频道可以发送消息', async () => {
      const runtime = new ChannelRuntime();
      const config: ChannelConfig = { id: 'msg-channel', type: 'im' };

      const channel = await runtime.createChannel(config);
      await expect(channel.sendMessage('test message')).resolves.not.toThrow();
    });

    it('已销毁的频道发送消息抛出错误', async () => {
      const runtime = new ChannelRuntime();
      const config: ChannelConfig = { id: 'msg-destroy-channel', type: 'im' };

      const channel = await runtime.createChannel(config);
      await runtime.destroyChannel('msg-destroy-channel');

      await expect(channel.sendMessage('test')).rejects.toThrow('not found');
    });
  });

  describe('clear 清理所有频道', () => {
    it('清理所有频道', async () => {
      const runtime = new ChannelRuntime();

      await runtime.createChannel({ id: 'clear-1', type: 'im' });
      await runtime.createChannel({ id: 'clear-2', type: 'webhook' });

      await runtime.clear();

      expect(runtime.listChannels()).toHaveLength(0);
    });
  });
});