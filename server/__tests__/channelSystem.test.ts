import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getChannelManager, resetChannelManager, type ChannelConfig } from '../engine/channelSystem.js';

describe('通道系统', () => {
  beforeEach(() => {
    resetChannelManager();
  });

  describe('ChannelManager', () => {
    it('应能添加和移除通道', async () => {
      const mgr = getChannelManager();
      const config: ChannelConfig = {
        type: 'webhook',
        name: 'test-webhook',
        enabled: true,
        credentials: { webhookUrl: 'https://example.com/hook' },
      };
      await mgr.addChannel(config);
      expect(mgr.getChannels()).toHaveLength(1);
      await mgr.removeChannel('test-webhook');
      expect(mgr.getChannels()).toHaveLength(0);
    });

    it('应能发送消息到 webhook 通道', async () => {
      const mgr = getChannelManager();
      await mgr.addChannel({
        type: 'webhook',
        name: 'wh',
        enabled: true,
        credentials: { webhookUrl: 'https://example.com/hook' },
      });
      // mock fetch
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      const result = await mgr.sendMessage('wh', '测试消息');
      expect(result).toBe(true);
      fetchSpy.mockRestore();
    });

    it('广播消息应返回统计', async () => {
      const mgr = getChannelManager();
      await mgr.addChannel({ type: 'webhook', name: 'ch1', enabled: true, credentials: { webhookUrl: 'https://ex.com/h' } });
      await mgr.addChannel({ type: 'webhook', name: 'ch2', enabled: true, credentials: { webhookUrl: 'https://ex.com/h' } });
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
      const stats = await mgr.broadcast('广播消息');
      expect(stats.total).toBe(2);
      expect(stats.success).toBe(2);
      fetchSpy.mockRestore();
    });

    it('健康检查应返回所有通道状态', async () => {
      const mgr = getChannelManager();
      await mgr.addChannel({ type: 'webhook', name: 'ch1', enabled: true, credentials: { webhookUrl: 'https://ex.com/h' } });
      const health = await mgr.healthCheckAll();
      expect(health).toHaveProperty('ch1');
    });
  });

  describe('飞书通道', () => {
    it('应正确构建飞书消息体', async () => {
      const mgr = getChannelManager();
      await mgr.addChannel({
        type: 'feishu',
        name: 'feishu-test',
        enabled: true,
        credentials: { botWebhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/xxx' },
      });
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ code: 0 }), { status: 200 })
      );
      const result = await mgr.sendMessage('feishu-test', '测试消息');
      expect(result).toBe(true);
      expect(fetchSpy).toHaveBeenCalled();
      fetchSpy.mockRestore();
    });
  });

  describe('钉钉通道', () => {
    it('应正确构建钉钉消息体', async () => {
      const mgr = getChannelManager();
      await mgr.addChannel({
        type: 'dingtalk',
        name: 'dt-test',
        enabled: true,
        credentials: { webhookUrl: 'https://oapi.dingtalk.com/robot/send?access_token=xxx' },
      });
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ errcode: 0 }), { status: 200 })
      );
      const result = await mgr.sendMessage('dt-test', '测试');
      expect(result).toBe(true);
      fetchSpy.mockRestore();
    });
  });
});
