/**
 * Channels 路由单元测试
 *
 * 覆盖 P2-8 通道管理路由：
 * - GET /api/channels/types 列出通道类型
 * - GET /api/channels 列出所有通道
 * - POST /api/channels 添加通道
 * - GET /api/channels/:name 获取通道详情
 * - PUT /api/channels/:name 更新通道
 * - DELETE /api/channels/:name 删除通道
 * - POST /api/channels/:name/enable|disable 启停通道
 * - POST /api/channels/:name/send 发送消息
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// mock ChannelManager
const mockGetChannels = vi.fn();
const mockAddChannel = vi.fn();
const mockRemoveChannel = vi.fn();
const mockGetChannelStatus = vi.fn();
const mockSendMessage = vi.fn();
const mockListAccounts = vi.fn();
const mockAddAccount = vi.fn();
const mockRemoveAccount = vi.fn();

const mockManager = {
  getChannels: mockGetChannels,
  addChannel: mockAddChannel,
  removeChannel: mockRemoveChannel,
  getChannelStatus: mockGetChannelStatus,
  sendMessage: mockSendMessage,
  listAccounts: mockListAccounts,
  addAccount: mockAddAccount,
  removeAccount: mockRemoveAccount,
};

vi.mock('../../engine/channelSystem.js', () => ({
  getChannelManager: () => mockManager,
}));

import channelsRouter from '../channels.js';

describe('Channels 路由', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/channels', channelsRouter);

    // 默认 mock 返回值
    mockGetChannels.mockReturnValue([]);
    mockGetChannelStatus.mockReturnValue('disconnected');
    mockListAccounts.mockReturnValue([]);
  });

  describe('GET /api/channels/types', () => {
    it('应返回支持的通道类型列表', async () => {
      const res = await request(app).get('/api/channels/types');

      expect(res.status).toBe(200);
      expect(res.body.types).toBeInstanceOf(Array);
      expect(res.body.types.length).toBe(6);

      const types = res.body.types.map((t: any) => t.type);
      expect(types).toContain('webhook');
      expect(types).toContain('feishu');
      expect(types).toContain('dingtalk');
      expect(types).toContain('wechat');
      expect(types).toContain('wechat_work');
    });

    it('每个类型应包含 label 和 description', async () => {
      const res = await request(app).get('/api/channels/types');
      const first = res.body.types[0];

      expect(first).toHaveProperty('type');
      expect(first).toHaveProperty('label');
      expect(first).toHaveProperty('description');
      expect(first).toHaveProperty('bidirectional');
    });
  });

  describe('GET /api/channels', () => {
    it('应返回所有通道列表', async () => {
      mockGetChannels.mockReturnValue([
        { name: 'ch1', type: 'webhook', enabled: true, credentials: {}, settings: {} },
      ]);

      const res = await request(app).get('/api/channels');

      expect(res.status).toBe(200);
      expect(res.body.channels).toHaveLength(1);
      expect(res.body.channels[0].name).toBe('ch1');
      expect(res.body.channels[0]).toHaveProperty('status');
      expect(res.body.channels[0]).toHaveProperty('accountCount');
    });
  });

  describe('POST /api/channels', () => {
    it('应能添加新通道', async () => {
      mockAddChannel.mockResolvedValue(true);
      mockGetChannels.mockReturnValue([]);

      const res = await request(app)
        .post('/api/channels')
        .send({
          name: 'new-ch',
          type: 'webhook',
          enabled: true,
          credentials: { webhookUrl: 'https://example.com/hook' },
          settings: {},
        });

      expect(res.status).toBe(201);
      expect(mockAddChannel).toHaveBeenCalled();
    });

    it('缺少 name 字段时应返回 400', async () => {
      const res = await request(app)
        .post('/api/channels')
        .send({ type: 'webhook', enabled: true, credentials: {}, settings: {} });

      expect(res.status).toBe(400);
    });

    it('不支持的通道类型应返回 400', async () => {
      const res = await request(app)
        .post('/api/channels')
        .send({ name: 'bad', type: 'unknown-type', enabled: true, credentials: {}, settings: {} });

      expect(res.status).toBe(400);
    });

    it('通道名已存在时应返回 409', async () => {
      mockGetChannels.mockReturnValue([
        { name: 'existing', type: 'webhook', enabled: true, credentials: {}, settings: {} },
      ]);

      const res = await request(app)
        .post('/api/channels')
        .send({ name: 'existing', type: 'webhook', enabled: true, credentials: {}, settings: {} });

      expect(res.status).toBe(409);
    });

    it('addChannel 失败时应返回 500', async () => {
      mockAddChannel.mockResolvedValue(false);
      mockGetChannels.mockReturnValue([]);

      const res = await request(app)
        .post('/api/channels')
        .send({ name: 'fail-ch', type: 'webhook', enabled: true, credentials: {}, settings: {} });

      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/channels/:name', () => {
    it('应返回通道详情', async () => {
      mockGetChannels.mockReturnValue([
        { name: 'detail-ch', type: 'feishu', enabled: true, credentials: {}, settings: {} },
      ]);
      mockListAccounts.mockReturnValue([{ id: 'a1', accountName: 'bot1' }]);

      const res = await request(app).get('/api/channels/detail-ch');

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('detail-ch');
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('accounts');
    });

    it('通道不存在时应返回 404', async () => {
      mockGetChannels.mockReturnValue([]);

      const res = await request(app).get('/api/channels/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/channels/:name', () => {
    it('应能删除通道', async () => {
      mockGetChannels.mockReturnValue([
        { name: 'del-ch', type: 'webhook', enabled: true, credentials: {}, settings: {} },
      ]);
      mockRemoveChannel.mockResolvedValue(undefined);

      const res = await request(app).delete('/api/channels/del-ch');

      expect(res.status).toBe(200);
      expect(mockRemoveChannel).toHaveBeenCalledWith('del-ch');
    });

    it('通道不存在时应返回 404', async () => {
      mockGetChannels.mockReturnValue([]);

      const res = await request(app).delete('/api/channels/nonexistent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/channels/:name/enable', () => {
    it('应能启用通道', async () => {
      mockGetChannels.mockReturnValue([
        { name: 'en-ch', type: 'webhook', enabled: false, credentials: {}, settings: {} },
      ]);

      const res = await request(app).post('/api/channels/en-ch/enable');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('通道不存在时应返回 404', async () => {
      mockGetChannels.mockReturnValue([]);

      const res = await request(app).post('/api/channels/nonexistent/enable');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/channels/:name/disable', () => {
    it('应能禁用通道', async () => {
      mockGetChannels.mockReturnValue([
        { name: 'dis-ch', type: 'webhook', enabled: true, credentials: {}, settings: {} },
      ]);

      const res = await request(app).post('/api/channels/dis-ch/disable');

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/channels/:name/send', () => {
    it('应能发送消息到通道', async () => {
      mockSendMessage.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/channels/send-ch/send')
        .send({ content: 'hello', contentType: 'text' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith('send-ch', 'hello', 'text');
    });

    it('缺少 content 字段时应返回 400', async () => {
      const res = await request(app)
        .post('/api/channels/send-ch/send')
        .send({ contentType: 'text' });

      expect(res.status).toBe(400);
    });
  });

  describe('账户管理', () => {
    it('GET /:name/accounts 应返回账户列表', async () => {
      mockListAccounts.mockReturnValue([
        { id: 'a1', accountId: 'acc1', accountName: 'Bot 1' },
      ]);

      const res = await request(app).get('/api/channels/acct-ch/accounts');

      expect(res.status).toBe(200);
      expect(res.body.accounts).toHaveLength(1);
    });

    it('POST /:name/accounts 应能添加账户', async () => {
      mockAddAccount.mockReturnValue('acct_new_123');

      const res = await request(app)
        .post('/api/channels/acct-ch/accounts')
        .send({
          accountId: 'acc-new',
          accountName: 'New Bot',
          credentials: {},
          enabled: true,
          isDefault: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.accountId).toBe('acct_new_123');
    });

    it('POST /:name/accounts 缺少必填字段时应返回 400', async () => {
      const res = await request(app)
        .post('/api/channels/acct-ch/accounts')
        .send({ credentials: {} });

      expect(res.status).toBe(400);
    });

    it('DELETE /:name/accounts/:accountId 应能删除账户', async () => {
      mockRemoveAccount.mockReturnValue(true);

      const res = await request(app).delete('/api/channels/acct-ch/accounts/acct_123');

      expect(res.status).toBe(200);
      expect(mockRemoveAccount).toHaveBeenCalledWith('acct-ch', 'acct_123');
    });

    it('DELETE 账户不存在时应返回 404', async () => {
      mockRemoveAccount.mockReturnValue(false);

      const res = await request(app).delete('/api/channels/acct-ch/accounts/nonexistent');

      expect(res.status).toBe(404);
    });
  });
});
