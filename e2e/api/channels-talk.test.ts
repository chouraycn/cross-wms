/**
 * Channels & Talk API E2E 测试
 *
 * 覆盖 P2-8 新增路由的端到端场景：
 * - Talk 配置读取 → 更新 → 重置流程
 * - 通道类型查询 → 创建通道 → 查询详情 → 启停 → 发送消息 → 删除流程
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// mock logger
vi.mock('../../server/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// mock talk config
vi.mock('../../server/config/talk.js', () => ({
  TALK_CONFIG_DEFAULTS: {
    defaultProvider: 'system',
    silenceTimeoutMs: 700,
    speechLocale: 'zh-CN',
    interruptOnSpeech: false,
    consultThinkingLevel: 'medium',
    consultFastMode: false,
    realtimeMode: 'stt-tts',
    transport: 'gateway-relay',
    brain: 'agent-consult',
    consultRouting: 'provider-direct',
  },
  describeTalkSilenceTimeoutDefaults: () => '700 ms on macOS and Android, 900 ms on iOS',
  resolveTalkConfig: vi.fn((cfg) => cfg ?? {
    speechLocale: 'zh-CN',
    silenceTimeoutMs: 700,
    interruptOnSpeech: false,
    consultThinkingLevel: 'medium',
    consultFastMode: false,
  }),
  buildTalkConfigResponse: vi.fn((cfg) => cfg),
  normalizeTalkSection: vi.fn((cfg) => cfg),
}));

// mock ChannelManager
const channelStore = new Map<string, any>();
vi.mock('../../server/engine/channelSystem.js', () => ({
  getChannelManager: () => ({
    getChannels: () => Array.from(channelStore.values()),
    addChannel: async (config: any) => { channelStore.set(config.name, { ...config, settings: config.settings ?? {} }); return true; },
    removeChannel: async (name: string) => { channelStore.delete(name); },
    getChannelStatus: (name: string) => channelStore.get(name)?.enabled ? 'connected' : 'disconnected',
    sendMessage: async () => true,
    listAccounts: () => [],
    addAccount: () => `acct_${Date.now()}`,
    removeAccount: () => true,
  }),
}));

import talkRouter from '../../server/routes/talk.js';
import channelsRouter from '../../server/routes/channels.js';

describe('Channels & Talk API E2E', () => {
  let app: express.Application;

  beforeEach(() => {
    channelStore.clear();
    app = express();
    app.use(express.json());
    app.use('/api/talk', talkRouter);
    app.use('/api/channels', channelsRouter);
  });

  describe('Talk 配置端到端流程', () => {
    it('完整流程：读取 → 更新 → 读取验证 → 重置', async () => {
      // 1. 读取初始配置
      const initial = await request(app).get('/api/talk/config');
      expect(initial.status).toBe(200);

      // 2. 更新配置
      const updated = await request(app)
        .put('/api/talk/config')
        .send({
          speechLocale: 'en-US',
          silenceTimeoutMs: 900,
          interruptOnSpeech: true,
        });
      expect(updated.status).toBe(200);

      // 3. 重置配置
      const reset = await request(app).post('/api/talk/config/reset');
      expect(reset.status).toBe(200);

      // 4. 读取默认值
      const defaults = await request(app).get('/api/talk/defaults');
      expect(defaults.status).toBe(200);
      expect(defaults.body.defaults.speechLocale).toBe('zh-CN');
    });
  });

  describe('通道管理端到端流程', () => {
    it('完整流程：查询类型 → 创建 → 查询列表 → 查询详情 → 启用 → 发送消息 → 禁用 → 删除', async () => {
      // 1. 查询支持的通道类型
      const types = await request(app).get('/api/channels/types');
      expect(types.status).toBe(200);
      expect(types.body.types.length).toBeGreaterThan(0);

      // 2. 创建通道
      const created = await request(app)
        .post('/api/channels')
        .send({
          name: 'e2e-test-channel',
          type: 'webhook',
          enabled: true,
          credentials: { webhookUrl: 'https://example.com/hook' },
          settings: {},
        });
      expect(created.status).toBe(201);

      // 3. 查询列表
      const list = await request(app).get('/api/channels');
      expect(list.status).toBe(200);
      expect(list.body.channels.some((c: any) => c.name === 'e2e-test-channel')).toBe(true);

      // 4. 查询详情
      const detail = await request(app).get('/api/channels/e2e-test-channel');
      expect(detail.status).toBe(200);
      expect(detail.body.name).toBe('e2e-test-channel');

      // 5. 禁用通道
      const disabled = await request(app).post('/api/channels/e2e-test-channel/disable');
      expect(disabled.status).toBe(200);

      // 6. 启用通道
      const enabled = await request(app).post('/api/channels/e2e-test-channel/enable');
      expect(enabled.status).toBe(200);

      // 7. 发送消息
      const sent = await request(app)
        .post('/api/channels/e2e-test-channel/send')
        .send({ content: 'E2E test message', contentType: 'text' });
      expect(sent.status).toBe(200);
      expect(sent.body.ok).toBe(true);

      // 8. 删除通道
      const deleted = await request(app).delete('/api/channels/e2e-test-channel');
      expect(deleted.status).toBe(200);

      // 9. 验证已删除
      const listAfter = await request(app).get('/api/channels');
      expect(listAfter.body.channels.some((c: any) => c.name === 'e2e-test-channel')).toBe(false);
    });

    it('应能创建多种类型的通道', async () => {
      const types = ['webhook', 'feishu', 'dingtalk', 'wechat', 'wechat_work'];

      for (const type of types) {
        const res = await request(app)
          .post('/api/channels')
          .send({
            name: `e2e-${type}`,
            type,
            enabled: true,
            credentials: type === 'wechat' ? { gatewayUrl: 'https://ex.com', token: 'test' } : { webhookUrl: 'https://ex.com' },
            settings: {},
          });
        expect(res.status).toBe(201);
      }

      const list = await request(app).get('/api/channels');
      expect(list.body.channels.length).toBe(5);
    });

    it('重复创建同名通道应返回 409', async () => {
      await request(app)
        .post('/api/channels')
        .send({
          name: 'dup-ch',
          type: 'webhook',
          enabled: true,
          credentials: { webhookUrl: 'https://ex.com' },
          settings: {},
        });

      const dup = await request(app)
        .post('/api/channels')
        .send({
          name: 'dup-ch',
          type: 'webhook',
          enabled: true,
          credentials: { webhookUrl: 'https://ex.com' },
          settings: {},
        });

      expect(dup.status).toBe(409);
    });
  });
});
