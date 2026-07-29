/**
 * Channels (通道管理) 路由
 *
 * 提供通道的 CRUD、启停、状态查询、账户管理、消息发送等接口。
 * 对接 server/engine/channelSystem.ts 的 ChannelManager。
 *
 * 路由：
 *   GET    /api/channels              — 列出所有通道
 *   POST   /api/channels              — 添加通道
 *   GET    /api/channels/:name        — 获取单个通道详情
 *   PUT    /api/channels/:name        — 更新通道配置
 *   DELETE /api/channels/:name        — 删除通道
 *   POST   /api/channels/:name/enable — 启用通道
 *   POST   /api/channels/:name/disable— 禁用通道
 *   GET    /api/channels/:name/status — 获取通道状态
 *   POST   /api/channels/:name/send   — 发送消息到通道
 *   GET    /api/channels/types        — 列出支持的通道类型
 *   GET    /api/channels/:name/accounts    — 列出通道账户
 *   POST   /api/channels/:name/accounts    — 添加通道账户
 *   DELETE /api/channels/:name/accounts/:accountId — 删除通道账户
 */

import { Router } from 'express';
import {
  getChannelManager,
  type ChannelConfig,
  type ChannelType,
  type ChannelStatus,
} from '../engine/channelSystem.js';
import { randomBytes } from 'node:crypto';
import { logger } from '../logger.js';

const router: Router = Router();

/** 支持的通道类型列表（含描述，供前端 UI 渲染） */
const SUPPORTED_CHANNEL_TYPES: Array<{
  type: ChannelType;
  label: string;
  description: string;
  bidirectional: boolean;
}> = [
  { type: 'webhook', label: 'Webhook', description: '通用 Webhook 通道，支持出站推送', bidirectional: false },
  { type: 'feishu', label: '飞书', description: '飞书机器人（双向）', bidirectional: true },
  { type: 'dingtalk', label: '钉钉', description: '钉钉机器人 + Stream API（双向）', bidirectional: true },
  { type: 'wechat', label: '微信', description: '个人微信（通过网关双向通信）', bidirectional: true },
  { type: 'wechat_work', label: '企业微信', description: '企业微信机器人 + 回调 API（双向）', bidirectional: true },
  { type: 'email', label: '邮件', description: 'SMTP 邮件通知', bidirectional: false },
];

/**
 * GET /api/channels/types
 * 返回支持的通道类型列表
 */
router.get('/types', (_req, res) => {
  res.json({ types: SUPPORTED_CHANNEL_TYPES });
});

/**
 * GET /api/channels
 * 列出所有已注册的通道配置
 */
router.get('/', (_req, res) => {
  try {
    const manager = getChannelManager();
    const channels = manager.getChannels().map(config => ({
      ...config,
      status: manager.getChannelStatus(config.name) as ChannelStatus,
      accountCount: manager.listAccounts(config.name).length,
    }));
    res.json({ channels });
  } catch (err) {
    logger.error('[ChannelsRoute] GET / failed:', err);
    res.status(500).json({ error: 'Failed to list channels' });
  }
});

/**
 * POST /api/channels
 * 添加新通道
 * Body: ChannelConfig
 */
router.post('/', async (req, res) => {
  try {
    const config = req.body as ChannelConfig;
    if (!config || !config.name || !config.type) {
      res.status(400).json({ error: 'Missing required fields: name, type' });
      return;
    }

    const supported = SUPPORTED_CHANNEL_TYPES.some(t => t.type === config.type);
    if (!supported) {
      res.status(400).json({ error: `Unsupported channel type: ${config.type}` });
      return;
    }

    const manager = getChannelManager();
    const existing = manager.getChannels().find(c => c.name === config.name);
    if (existing) {
      res.status(409).json({ error: `Channel with name '${config.name}' already exists` });
      return;
    }

    const ok = await manager.addChannel(config);
    if (!ok) {
      res.status(500).json({ error: 'Failed to add channel' });
      return;
    }

    logger.info(`[ChannelsRoute] Channel added: ${config.name} (${config.type})`);
    res.status(201).json({ channel: config, status: manager.getChannelStatus(config.name) });
  } catch (err) {
    logger.error('[ChannelsRoute] POST / failed:', err);
    res.status(500).json({ error: 'Failed to add channel' });
  }
});

/**
 * GET /api/channels/:name
 * 获取单个通道详情
 */
router.get('/:name', (req, res) => {
  try {
    const { name } = req.params;
    const manager = getChannelManager();
    const channels = manager.getChannels();
    const config = channels.find(c => c.name === name);
    if (!config) {
      res.status(404).json({ error: `Channel '${name}' not found` });
      return;
    }
    res.json({
      ...config,
      status: manager.getChannelStatus(name),
      accounts: manager.listAccounts(name),
    });
  } catch (err) {
    logger.error('[ChannelsRoute] GET /:name failed:', err);
    res.status(500).json({ error: 'Failed to get channel' });
  }
});

/**
 * PUT /api/channels/:name
 * 更新通道配置（部分更新：enabled, credentials, settings）
 */
router.put('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const updates = req.body as Partial<ChannelConfig>;
    const manager = getChannelManager();
    const channels = manager.getChannels();
    const existing = channels.find(c => c.name === name);
    if (!existing) {
      res.status(404).json({ error: `Channel '${name}' not found` });
      return;
    }

    // 先移除再添加（ChannelManager 暂无 update 方法）
    await manager.removeChannel(name);
    const merged: ChannelConfig = { ...existing, ...updates };
    const ok = await manager.addChannel(merged);
    if (!ok) {
      res.status(500).json({ error: 'Failed to re-add channel after update' });
      return;
    }
    logger.info(`[ChannelsRoute] Channel updated: ${name}`);
    res.json({ channel: merged, status: manager.getChannelStatus(name) });
  } catch (err) {
    logger.error('[ChannelsRoute] PUT /:name failed:', err);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

/**
 * DELETE /api/channels/:name
 * 删除通道
 */
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const manager = getChannelManager();
    const channels = manager.getChannels();
    const existing = channels.find(c => c.name === name);
    if (!existing) {
      res.status(404).json({ error: `Channel '${name}' not found` });
      return;
    }
    await manager.removeChannel(name);
    logger.info(`[ChannelsRoute] Channel removed: ${name}`);
    res.json({ ok: true });
  } catch (err) {
    logger.error('[ChannelsRoute] DELETE /:name failed:', err);
    res.status(500).json({ error: 'Failed to remove channel' });
  }
});

/**
 * POST /api/channels/:name/enable
 * 启用通道
 */
router.post('/:name/enable', async (req, res) => {
  try {
    const { name } = req.params;
    const manager = getChannelManager();
    const channels = manager.getChannels();
    const existing = channels.find(c => c.name === name);
    if (!existing) {
      res.status(404).json({ error: `Channel '${name}' not found` });
      return;
    }
    existing.enabled = true;
    res.json({ ok: true, status: manager.getChannelStatus(name) });
  } catch (err) {
    logger.error('[ChannelsRoute] POST /:name/enable failed:', err);
    res.status(500).json({ error: 'Failed to enable channel' });
  }
});

/**
 * POST /api/channels/:name/disable
 * 禁用通道
 */
router.post('/:name/disable', async (req, res) => {
  try {
    const { name } = req.params;
    const manager = getChannelManager();
    const channels = manager.getChannels();
    const existing = channels.find(c => c.name === name);
    if (!existing) {
      res.status(404).json({ error: `Channel '${name}' not found` });
      return;
    }
    existing.enabled = false;
    res.json({ ok: true, status: manager.getChannelStatus(name) });
  } catch (err) {
    logger.error('[ChannelsRoute] POST /:name/disable failed:', err);
    res.status(500).json({ error: 'Failed to disable channel' });
  }
});

/**
 * GET /api/channels/:name/status
 * 获取通道状态
 */
router.get('/:name/status', (req, res) => {
  try {
    const { name } = req.params;
    const manager = getChannelManager();
    const status = manager.getChannelStatus(name);
    res.json({ name, status });
  } catch (err) {
    logger.error('[ChannelsRoute] GET /:name/status failed:', err);
    res.status(500).json({ error: 'Failed to get channel status' });
  }
});

/**
 * POST /api/channels/:name/send
 * 发送消息到通道
 * Body: { content: string, contentType?: 'text' | 'markdown' | 'json' }
 */
router.post('/:name/send', async (req, res) => {
  try {
    const { name } = req.params;
    const { content, contentType } = req.body as { content: string; contentType?: 'text' | 'markdown' | 'json' };
    if (!content) {
      res.status(400).json({ error: 'Missing required field: content' });
      return;
    }
    const manager = getChannelManager();
    const ok = await manager.sendMessage(name, content, contentType);
    res.json({ ok, channelName: name });
  } catch (err) {
    logger.error('[ChannelsRoute] POST /:name/send failed:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * GET /api/channels/:name/accounts
 * 列出通道账户
 */
router.get('/:name/accounts', (req, res) => {
  try {
    const { name } = req.params;
    const manager = getChannelManager();
    const accounts = manager.listAccounts(name);
    res.json({ accounts });
  } catch (err) {
    logger.error('[ChannelsRoute] GET /:name/accounts failed:', err);
    res.status(500).json({ error: 'Failed to list accounts' });
  }
});

/**
 * POST /api/channels/:name/accounts
 * 添加通道账户
 */
router.post('/:name/accounts', (req, res) => {
  try {
    const { name } = req.params;
    const account = req.body;
    if (!account || !account.accountId || !account.accountName) {
      res.status(400).json({ error: 'Missing required fields: accountId, accountName' });
      return;
    }
    const manager = getChannelManager();
    const accountId = manager.addAccount(name, {
      accountId: account.accountId,
      accountName: account.accountName,
      credentials: account.credentials ?? {},
      enabled: account.enabled ?? true,
      isDefault: account.isDefault ?? false,
      lastUsedAt: undefined,
    });
    logger.info(`[ChannelsRoute] Account added to channel '${name}': ${accountId}`);
    res.status(201).json({ accountId });
  } catch (err) {
    logger.error('[ChannelsRoute] POST /:name/accounts failed:', err);
    res.status(500).json({ error: 'Failed to add account' });
  }
});

/**
 * DELETE /api/channels/:name/accounts/:accountId
 * 删除通道账户
 */
router.delete('/:name/accounts/:accountId', (req, res) => {
  try {
    const { name, accountId } = req.params;
    const manager = getChannelManager();
    const ok = manager.removeAccount(name, accountId);
    if (!ok) {
      res.status(404).json({ error: `Account '${accountId}' not found in channel '${name}'` });
      return;
    }
    logger.info(`[ChannelsRoute] Account removed: ${accountId} from channel '${name}'`);
    res.json({ ok: true });
  } catch (err) {
    logger.error('[ChannelsRoute] DELETE /:name/accounts/:accountId failed:', err);
    res.status(500).json({ error: 'Failed to remove account' });
  }
});

/**
 * ============== 微信 / 企业微信 扫码绑定二维码流 ==============
 *
 * 本桌面应用不内置微信 ilink 网关，二维码绑定采用本地会话模型：
 *  - 后端生成一次性绑定 token（进程内内存存储，重启即失效），返回 token + 绑定内容；
 *  - 前端用 qrcode 库把内容渲染成二维码图片展示；
 *  - 轮询 qrcode-status 获取状态（wait → confirmed / expired）；
 *  - qrcode-confirm 是「扫码确认」入口：真实环境由微信回调调用，
 *    本地演示 / 调试由前端「模拟扫码确认」按钮调用。
 *
 * 路由：
 *   GET  /api/channels/:name/wechat/qrcode          — 生成绑定二维码
 *   GET  /api/channels/:name/wechat/qrcode-status   — 轮询绑定状态
 *   POST /api/channels/:name/wechat/qrcode-confirm  — 确认绑定（微信回调 / 演示）
 */

type WechatBindStatus = 'wait' | 'confirmed' | 'expired';
interface WechatBindSession {
  token: string;
  channelName: string;
  content: string;
  createdAt: number;
  expiresAt: number;
  status: WechatBindStatus;
}

const WECHAT_BIND_TTL_MS = 120_000;
const wechatBindSessions = new Map<string, WechatBindSession>();

/** 惰性清理过期会话，避免内存无限增长 */
function purgeExpiredWechatSessions(now: number): void {
  for (const [token, session] of wechatBindSessions) {
    if (now > session.expiresAt) wechatBindSessions.delete(token);
  }
}

/** 仅当通道存在且为微信 / 企业微信时返回配置 */
function findWechatChannel(name: string) {
  const manager = getChannelManager();
  const channel = manager.getChannels().find(c => c.name === name);
  return channel && (channel.type === 'wechat' || channel.type === 'wechat_work') ? channel : null;
}

/**
 * GET /api/channels/:name/wechat/qrcode
 * 生成一次性绑定 token 与二维码内容；返回 { qrcode, qrcode_img_content, qrcode_img_url }
 */
router.get('/:name/wechat/qrcode', (req, res) => {
  try {
    const { name } = req.params;
    const channel = findWechatChannel(name);
    if (!channel) {
      res.status(404).json({ error: `WeChat channel '${name}' not found` });
      return;
    }
    const now = Date.now();
    purgeExpiredWechatSessions(now);
    const token = randomBytes(16).toString('hex');
    const content = `cdfknow://wechat/bind?token=${token}&channel=${encodeURIComponent(name)}&ts=${now}`;
    wechatBindSessions.set(token, {
      token,
      channelName: name,
      content,
      createdAt: now,
      expiresAt: now + WECHAT_BIND_TTL_MS,
      status: 'wait',
    });
    logger.info(`[ChannelsRoute] WeChat bind qrcode issued for channel '${name}' (token=${token.slice(0, 8)}…)`);
    res.json({ qrcode: token, qrcode_img_content: content, qrcode_img_url: null });
  } catch (err) {
    logger.error('[ChannelsRoute] GET /:name/wechat/qrcode failed:', err);
    res.status(500).json({ error: 'Failed to issue WeChat bind qrcode' });
  }
});

/**
 * GET /api/channels/:name/wechat/qrcode-status?qrcode=xxx
 * 轮询绑定状态；返回 { status }
 */
router.get('/:name/wechat/qrcode-status', (req, res) => {
  try {
    const { name } = req.params;
    const qrcode = String(req.query.qrcode || '');
    const session = wechatBindSessions.get(qrcode);
    if (!session || session.channelName !== name) {
      res.status(404).json({ error: 'Invalid or unknown qrcode' });
      return;
    }
    const now = Date.now();
    if (session.status === 'wait' && now > session.expiresAt) {
      session.status = 'expired';
    }
    res.json({ status: session.status });
  } catch (err) {
    logger.error('[ChannelsRoute] GET /:name/wechat/qrcode-status failed:', err);
    res.status(500).json({ error: 'Failed to query WeChat bind status' });
  }
});

/**
 * POST /api/channels/:name/wechat/qrcode-confirm?qrcode=xxx
 * 确认绑定（真实环境由微信回调调用；本地演示由前端「模拟扫码确认」触发）。
 * 返回 { ok, status }
 */
router.post('/:name/wechat/qrcode-confirm', (req, res) => {
  try {
    const { name } = req.params;
    const qrcode = String(req.query.qrcode || '');
    const session = wechatBindSessions.get(qrcode);
    if (!session || session.channelName !== name) {
      res.status(404).json({ error: 'Invalid or unknown qrcode' });
      return;
    }
    if (session.status === 'expired') {
      res.status(409).json({ error: 'Qrcode expired, please refresh' });
      return;
    }
    session.status = 'confirmed';
    logger.info(`[ChannelsRoute] WeChat bind confirmed for channel '${name}' (token=${qrcode.slice(0, 8)}…)`);
    res.json({ ok: true, status: 'confirmed' });
  } catch (err) {
    logger.error('[ChannelsRoute] POST /:name/wechat/qrcode-confirm failed:', err);
    res.status(500).json({ error: 'Failed to confirm WeChat bind' });
  }
});

export default router;
