/**
 * StaffDeck Channels Routes — 挂载于 /api/staffdeck/channels
 *
 * 移植自 StaffDeck-main/backend/app/api/channels.py，使嵌入前端「渠道接入」页
 * (frontend-enterprise/src/pages/ChannelsPage.tsx) 在 cross-wms 桌面端可正常使用。
 *
 * 端点（与 StaffDeck-main 前端一一对应）：
 *   GET    /meta                              — 渠道描述清单（基础信息 CHANNEL_META）
 *   GET    /                                  — 列出当前租户渠道绑定
 *   POST   /                                  — 创建渠道绑定
 *   POST   /bind-code                         — 生成身份绑定码（demo：进程内）
 *   GET    /my-identity-bindings              — 当前用户身份绑定
 *   DELETE /my-identity-bindings/:channel     — 解除身份绑定
 *   GET    /:bindingId/agents                 — 挂载员工列表
 *   PUT    /:bindingId                        — 更新挂载员工 / 智能分发
 *   DELETE /:bindingId                        — 删除绑定
 *   POST   /:bindingId/wechat/qrcode          — 微信二维码（个人微信网关路径）
 *   GET    /:bindingId/wechat/qrcode-status   — 轮询扫码状态（个人微信网关路径）
 *   POST   /:bindingId/wechat/credentials     — 微信公众号凭证（官方 API 探测校验后激活）
 *   POST   /:bindingId/wecom/credentials      — 企微凭证（官方 API 探测校验后激活）
 *   POST   /:bindingId/feishu/credentials     — 飞书凭证（本地激活）
 *   POST   /:bindingId/deliver                — 投递消息（复用 Channel Gateway）
 *   GET    /:bindingId/deliveries             — 投递日志（读 sd_channel_deliveries）
 *   GET    /:bindingId/deliveries/days        — 按天分组（空）
 *   GET    /:bindingId/conversations          — 对话记录（空）
 *   GET    /:bindingId/conversations/:sid/messages — 会话消息（空）
 *
 * 说明：
 *   - 所有成功响应统一返回 { code:0, data, message:'ok' }；数字员工嵌入前端无 envelope
 *     unwrap，由 server/index.ts 的剥离中间件在 /api/staffdeck/* 上拆出 data（仅 code===0）。
 *   - 企业微信/微信公众号凭证端点（wecom/wechat credentials）：2026-08-15 起真实化 —
 *     保存前用官方 API 探测（gettoken / agent/get）校验凭证有效性，通过才激活；
 *     deliverToChannel 对已激活且有凭证的绑定发起真实 HTTP 推送（不再只记日志）。
 *   - 微信 qrcode 端点保留：个人微信走外部网关时使用（demo/网关形态）。
 */
import { Router, type Request, type Response } from 'express';
import { initDb } from '../../db.js';
import {
  DEFAULT_TENANT_ID,
  newStaffId,
  StaffIdPrefix,
} from '../../db-staff.js';
import { sendWeComMessage, sendWeComWebhook, probeWeCom } from '../../../extensions/wecom/index.js';
import { sendWeChatCustomerMessage, probeWeChat } from '../../../extensions/wechat/index.js';
import { logger } from '../../logger.js';
import type Database from 'better-sqlite3';

const router = Router();

// ===================== 迁移：StaffDeck 渠道基础信息 =====================
// 来源：StaffDeck-main/backend/app/api/channels.py:CHANNEL_META
// 这是「渠道接入」页渲染渠道卡片与凭证表单的依据，已从原后端迁移到此处。
const SUPPORTED_CHANNELS = ['wechat', 'wecom', 'feishu'] as const;
type ChannelName = (typeof SUPPORTED_CHANNELS)[number];

const CHANNEL_META = [
  {
    channel: 'wechat',
    name: '微信',
    setup: 'qrcode',
    credential_fields: [] as Array<Record<string, any>>,
    capabilities: ['typing'],
  },
  {
    channel: 'wecom',
    name: '企业微信',
    setup: 'credentials',
    credential_fields: [
      { key: 'bot_id', label: '机器人 ID', placeholder: '企业微信后台获取', secret: false },
      { key: 'secret', label: '机器人 Secret', placeholder: null, secret: true },
      {
        key: 'corp_id',
        label: '企业 ID',
        placeholder: '管理后台-我的企业-企业信息',
        secret: false,
        optional: false,
      },
    ],
    capabilities: [] as string[],
  },
  {
    channel: 'feishu',
    name: '飞书',
    setup: 'credentials',
    credential_fields: [
      { key: 'app_id', label: 'App ID', placeholder: 'cli_xxx', secret: false },
      { key: 'app_secret', label: 'App Secret', placeholder: null, secret: true },
    ],
    capabilities: [] as string[],
  },
];

// bind-code 生成端限速（进程内，重启清零）
const BIND_CODE_TTL_MINUTES = 10;
const _bindCodeStore = new Map<string, { code: string; expires_at: number }>();

// ===================== 工具 =====================
function tenantOf(req: Request): string {
  return (req.query.tenant_id as string) || (req.body && req.body.tenant_id) || DEFAULT_TENANT_ID;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function isoFromUnix(sec: number | null | undefined): string {
  if (!sec) return new Date(0).toISOString();
  return new Date(sec * 1000).toISOString();
}

function parseJson(text: string | null | undefined): Record<string, any> {
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, any>) : {};
  } catch {
    return {};
  }
}

function getDb(): Database.Database {
  return initDb() as Database.Database;
}

/** row -> ChannelBindingRead（含挂载员工、config_json 扁平化到顶层已知字段） */
function buildBindingRead(
  db: Database.Database,
  row: any,
): Record<string, any> {
  const config = parseJson(row.config_json);
  const agentRows = db
    .prepare(
      'SELECT * FROM sd_channel_binding_agents WHERE binding_id = ? ORDER BY sort_order ASC',
    )
    .all(row.id) as any[];
  const agents = agentRows.map((a) => ({
    agent_id: a.agent_id,
    name: a.name || a.agent_id,
    is_default: a.is_default === 1,
    sort_order: a.sort_order,
  }));

  const flattened: Record<string, any> = {};
  for (const key of [
    'ilink_bot_id',
    'baseurl',
    'bot_id',
    'corp_id',
    'app_id',
    'bot_open_id',
    'bot_name',
    'provider_tenant_key',
    'bound_at',
  ]) {
    if (key in config) flattened[key] = config[key];
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    agent_id: row.agent_id,
    channel: row.channel,
    status: row.status,
    connected: row.connected === 1,
    config_revision: row.config_revision,
    session_expired: Boolean(config.session_expired),
    config_json: config,
    auto_route: config.auto_route ?? true,
    created_by_user_id: row.created_by_user_id,
    created_by_name: row.created_by_name,
    created_at: isoFromUnix(row.created_at),
    updated_at: isoFromUnix(row.updated_at),
    agents,
    ...flattened,
  };
}

function ok(res: Response, data: any): void {
  res.json({ code: 0, data, message: 'ok' });
}

function fail(res: Response, status: number, message: string): void {
  res.status(status).json({ code: status, data: null, message });
}

// ===================== GET /meta — 渠道基础信息 =====================
router.get('/meta', (req: Request, res: Response) => {
  // 任意登录用户可见；这里不强制鉴权，与列表接口一致（tenant 隔离）
  void tenantOf(req);
  ok(res, CHANNEL_META);
});

// ===================== GET / — 列出绑定 =====================
router.get('/', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM sd_channel_bindings WHERE tenant_id = ? ORDER BY created_at ASC')
    .all(tenantId) as any[];
  ok(res, rows.map((row) => buildBindingRead(db, row)));
});

// ===================== POST / — 创建绑定 =====================
router.post('/', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const channel = String(req.body?.channel || '');
  const agentId = String(req.body?.agent_id || '');
  if (!SUPPORTED_CHANNELS.includes(channel as ChannelName)) {
    fail(res, 400, `仅支持渠道: ${SUPPORTED_CHANNELS.join(', ')}`);
    return;
  }
  if (!agentId) {
    fail(res, 400, 'agent_id 不能为空');
    return;
  }
  const db = getDb();
  const id = newStaffId(StaffIdPrefix.channelBinding);
  const t = nowUnix();
  db.prepare(
    `INSERT INTO sd_channel_bindings
      (id, tenant_id, agent_id, channel, status, connected, config_json, config_revision, created_by_user_id, created_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, '{}', 0, ?, ?, ?, ?)`,
  ).run(id, tenantId, agentId, channel, 'default-user', 'default-user', t, t);
  // 新绑定自动挂载默认员工
  db.prepare(
    `INSERT INTO sd_channel_binding_agents (id, tenant_id, binding_id, agent_id, name, is_default, sort_order)
     VALUES (?, ?, ?, ?, ?, 1, 0)`,
  ).run(newStaffId(StaffIdPrefix.channelBinding), tenantId, id, agentId, agentId);
  const row = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ?').get(id);
  ok(res, buildBindingRead(db, row));
});

// ===================== POST /bind-code — 生成身份绑定码 =====================
router.post('/bind-code', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const key = `${tenantId}:default-user`;
  const existing = _bindCodeStore.get(key);
  const now = nowUnix();
  let code: string;
  let expiresAt: number;
  if (existing && existing.expires_at > now) {
    code = existing.code;
    expiresAt = existing.expires_at;
  } else {
    code = String(Math.floor(Math.random() * 900000) + 100000);
    expiresAt = now + BIND_CODE_TTL_MINUTES * 60;
    _bindCodeStore.set(key, { code, expires_at: expiresAt });
  }
  ok(res, { code, expires_at: isoFromUnix(expiresAt) });
});

// ===================== GET /my-identity-bindings =====================
router.get('/my-identity-bindings', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const db = getDb();
  const rows = db
    .prepare(
      'SELECT * FROM sd_channel_identities WHERE tenant_id = ? AND staffdeck_user_id = ? ORDER BY channel ASC',
    )
    .all(tenantId, 'default-user') as any[];
  ok(
    res,
    rows.map((r) => ({
      channel: r.channel,
      external_user_id: r.external_user_id,
      display_name: r.display_name,
      bound_at: isoFromUnix(r.updated_at),
      external_account_scope: r.external_account_scope,
    })),
  );
});

// ===================== DELETE /my-identity-bindings/:channel =====================
router.delete('/my-identity-bindings/:channel', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const channel = req.params.channel;
  const db = getDb();
  db.prepare(
    'DELETE FROM sd_channel_identities WHERE tenant_id = ? AND staffdeck_user_id = ? AND channel = ?',
  ).run(tenantId, 'default-user', channel);
  ok(res, null);
});

// ===================== GET /:bindingId/agents =====================
router.get('/:bindingId/agents', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  const agentRows = db
    .prepare('SELECT * FROM sd_channel_binding_agents WHERE binding_id = ? ORDER BY sort_order ASC')
    .all(bindingId) as any[];
  ok(
    res,
    agentRows.map((a) => ({
      agent_id: a.agent_id,
      name: a.name || a.agent_id,
      is_default: a.is_default === 1,
      sort_order: a.sort_order,
    })),
  );
});

// ===================== PUT /:bindingId — 更新挂载员工 / 智能分发 =====================
router.put('/:bindingId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const agents = req.body?.agents as
    | Array<{ agent_id: string; is_default?: boolean }>
    | undefined;
  const autoRoute = req.body?.auto_route;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  const config = parseJson((binding as any).config_json);
  if (agents !== undefined) {
    if (!agents.length) {
      fail(res, 400, '挂载员工列表不能为空');
      return;
    }
    const seen = new Set<string>();
    for (const item of agents) {
      if (seen.has(item.agent_id)) {
        fail(res, 400, '挂载员工列表存在重复');
        return;
      }
      seen.add(item.agent_id);
    }
    const marked = agents.filter((a) => a.is_default);
    const defaultAgentId = marked.length ? marked[0].agent_id : agents[0].agent_id;
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM sd_channel_binding_agents WHERE binding_id = ?').run(bindingId);
      agents.forEach((item, idx) => {
        db.prepare(
          `INSERT INTO sd_channel_binding_agents (id, tenant_id, binding_id, agent_id, name, is_default, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newStaffId(StaffIdPrefix.channelBinding),
          tenantId,
          bindingId,
          item.agent_id,
          item.agent_id,
          item.is_default ? 1 : 0,
          idx,
        );
      });
    });
    tx();
    db.prepare('UPDATE sd_channel_bindings SET agent_id = ?, updated_at = ? WHERE id = ?').run(
      defaultAgentId,
      nowUnix(),
      bindingId,
    );
  }
  if (autoRoute !== undefined) {
    config.auto_route = Boolean(autoRoute);
    db.prepare('UPDATE sd_channel_bindings SET config_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(config),
      nowUnix(),
      bindingId,
    );
  }
  const row = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ?').get(bindingId);
  ok(res, buildBindingRead(db, row));
});

// ===================== DELETE /:bindingId =====================
router.delete('/:bindingId', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM sd_channel_binding_agents WHERE binding_id = ?').run(bindingId);
    db.prepare('DELETE FROM sd_channel_bindings WHERE id = ?').run(bindingId);
  });
  tx();
  ok(res, null);
});

// ===================== 凭证保存（本地 demo 激活，无外部长连接） =====================
function activateBindingLocal(
  db: Database.Database,
  bindingId: string,
  extraConfig: Record<string, any>,
): Record<string, any> {
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ?').get(bindingId) as any;
  const config = { ...parseJson(binding.config_json), ...extraConfig };
  config.session_expired = false;
  config.bound_at = isoFromUnix(nowUnix());
  db.prepare(
    `UPDATE sd_channel_bindings
     SET status = 'active', connected = 1, config_json = ?, config_revision = config_revision + 1, updated_at = ?
     WHERE id = ?`,
  ).run(JSON.stringify(config), nowUnix(), bindingId);
  const row = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ?').get(bindingId);
  return buildBindingRead(db, row);
}

// ===================== 投递服务（供主程序与嵌入端复用） =====================
export interface DeliverToChannelOptions {
  tenantId?: string;
  channel?: string; // wechat | wecom | feishu
  bindingId?: string;
  agentId?: string;
  title?: string;
  content: string;
  type?: 'text' | 'alert' | 'card';
  /** 企微 userid / 公众号 openid（缺省：企微 @all，公众号用绑定配置 openid） */
  toUser?: string;
}

/**
 * 将消息投递到已接入的 IM 渠道（企业微信/微信公众号/飞书）。
 *
 * 这是「渠道反哺主程序」的核心：主程序任意 agent / automation 的执行结果，
 * 都可经此复用数字员工已配好的渠道绑定，主动推给 IM。
 *
 * 2026-08-15 真实化：企业微信（自建应用 / 群机器人 webhook）与微信公众号
 * （客服消息）在有凭证的绑定上发起真实 HTTP 推送，投递日志记录真实状态
 * （delivered / failed + error + 渠道侧 external_id）；无凭证或飞书仍走
 * demo 记录（飞书真实推送由 channel plugin / 网关承担）。
 */
export async function deliverToChannel(opts: DeliverToChannelOptions): Promise<{
  ok: boolean;
  delivery?: Record<string, any>;
  error?: string;
}> {
  const tenantId = opts.tenantId || DEFAULT_TENANT_ID;
  const db = getDb();
  let binding: any = null;
  if (opts.bindingId) {
    binding = db
      .prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?')
      .get(opts.bindingId, tenantId);
  } else if (opts.channel) {
    let rows = db
      .prepare(
        "SELECT * FROM sd_channel_bindings WHERE tenant_id = ? AND channel = ? AND status = 'active' ORDER BY updated_at DESC",
      )
      .all(tenantId, opts.channel) as any[];
    if (opts.agentId) rows = rows.filter((r) => r.agent_id === opts.agentId);
    if (rows.length) binding = rows[0];
  }
  if (!binding) {
    return {
      ok: false,
      error: opts.channel
        ? `未找到渠道「${opts.channel}」的激活绑定，请先在「渠道接入」完成接入并激活`
        : '未找到指定渠道绑定',
    };
  }
  const id = newStaffId(StaffIdPrefix.channelDelivery);
  const t = nowUnix();
  const type = opts.type || 'text';
  const config = parseJson(binding.config_json);

  // ===== 真实推送（有凭证才发；失败不阻断投递记录）=====
  let status = 'delivered';
  let errorMsg: string | null = null;
  let externalId: string | null = null;

  try {
    if (binding.channel === 'wecom') {
      const corpId = String(config.corp_id || config.corpId || '');
      const corpSecret = String(config.corp_secret || config.corpSecret || '');
      const agentId = String(config.agent_id || config.bot_id || '');
      const webhookUrl = String(config.webhook_url || '');
      if (webhookUrl) {
        const result = await sendWeComWebhook(webhookUrl, { msgtype: 'text', content: opts.content });
        if (!result.success) {
          status = 'failed';
          errorMsg = result.error ?? null;
        } else {
          externalId = result.messageId ?? null;
        }
      } else if (corpId && corpSecret && agentId) {
        const result = await sendWeComMessage({
          account: {
            corpId,
            corpSecret,
            agentId,
            token: config.token !== undefined ? String(config.token) : undefined,
            encodingAesKey: config.encoding_aes_key !== undefined ? String(config.encoding_aes_key) : undefined,
          },
          toUser: opts.toUser,
          msgtype: 'markdown',
          markdown: opts.content,
        });
        if (!result.success) {
          status = 'failed';
          errorMsg = result.error ?? null;
        } else {
          externalId = result.messageId ?? null;
        }
      } else {
        // 无凭证：demo 记录
        status = 'delivered';
      }
    } else if (binding.channel === 'wechat') {
      const appId = String(config.app_id || '');
      const appSecret = String(config.app_secret || '');
      const openid = String(opts.toUser || config.openid || '');
      if (appId && appSecret && openid) {
        const result = await sendWeChatCustomerMessage({
          account: { appId, appSecret },
          toUser: openid,
          msgtype: 'text',
          content: opts.content,
        });
        if (!result.success) {
          status = 'failed';
          errorMsg = result.error ?? null;
        } else {
          externalId = result.messageId ?? null;
        }
      } else if (!openid) {
        status = 'failed';
        errorMsg = '公众号投递缺少接收用户 openid（绑定配置 openid 或 opts.toUser）';
      } else {
        status = 'delivered'; // 无凭证：demo 记录
      }
    }
    // feishu 及其他渠道：真实推送由 channel plugin / 外部网关承担，此处保留 demo 记录
  } catch (err) {
    status = 'failed';
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  db.prepare(
    `INSERT INTO sd_channel_deliveries
      (id, tenant_id, binding_id, channel, agent_id, title, content, type, status, error, external_id, delivered_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    binding.id,
    binding.channel,
    binding.agent_id,
    opts.title || null,
    opts.content,
    type,
    status,
    errorMsg,
    externalId,
    status === 'delivered' ? t : null,
    t,
  );
  const row = db.prepare('SELECT * FROM sd_channel_deliveries WHERE id = ?').get(id) as any;
  const delivery: Record<string, any> = {
    id: row.id,
    binding_id: row.binding_id,
    channel: row.channel,
    agent_id: row.agent_id,
    title: row.title,
    content: row.content,
    type: row.type,
    status: row.status,
    delivered_at: isoFromUnix(row.delivered_at),
    created_at: isoFromUnix(row.created_at),
  };
  if (row.error) delivery.error = row.error;
  if (row.external_id) delivery.external_id = row.external_id;
  if (status === 'failed') {
    logger.warn(`[Channels] 渠道投递失败: channel=${binding.channel} delivery=${id} error=${errorMsg}`);
  } else if (externalId) {
    logger.info(`[Channels] 渠道投递成功: channel=${binding.channel} delivery=${id} external=${externalId}`);
  }
  return { ok: status !== 'failed', delivery, error: errorMsg ?? undefined };
}

// 微信二维码（demo）：返回可渲染的二维码内容，轮询即 confirmed
router.post('/:bindingId/wechat/qrcode', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  const code = `demo-${newStaffId(StaffIdPrefix.channelBinding).slice(-6)}`;
  ok(res, { qrcode: code, qrcode_img_content: code });
});

// 轮询微信扫码状态（demo）：直接 confirmed 并本地激活
router.get('/:bindingId/wechat/qrcode-status', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  const demoId = `demo-${newStaffId(StaffIdPrefix.channelBinding).slice(-6)}`;
  const updated = activateBindingLocal(db, bindingId, {
    ilink_bot_id: demoId,
    ilink_user_id: 'demo-user',
    baseurl: 'https://api.weixin.qq.com',
    get_updates_buf: '',
  });
  ok(res, { status: 'confirmed', binding: updated });
});

// 企微凭证（真实：官方 API 探测校验后激活）
// 字段映射（与前端 WecomSetup.tsx 对齐）：bot_id=应用 AgentId，secret=应用 Secret，corp_id=企业 ID
router.post('/:bindingId/wecom/credentials', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const botId = String(req.body?.bot_id || '').trim();
  const secret = String(req.body?.secret || '').trim();
  const corpId = String(req.body?.corp_id || '').trim();
  const token = String(req.body?.token || '').trim();
  const encodingAesKey = String(req.body?.encoding_aes_key || '').trim();
  const webhookUrl = String(req.body?.webhook_url || '').trim();
  if (!corpId || !secret) {
    fail(res, 400, 'corp_id 与 secret（企业微信应用 Secret）均不能为空');
    return;
  }
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  // 官方 API 探测：gettoken（corpId/corpSecret）+ agent/get（agentId 有效）
  const probe = await probeWeCom({
    corpId,
    corpSecret: secret,
    agentId: botId || undefined,
    token: token || undefined,
    encodingAesKey: encodingAesKey || undefined,
  });
  if (!probe.ok) {
    logger.info(`[Channels] 企微凭证探测未通过: ${probe.error}`);
    fail(res, 400, `凭证校验失败: ${probe.error}`);
    return;
  }
  const updated = activateBindingLocal(db, bindingId, {
    bot_id: botId,
    corp_id: corpId,
    corp_secret: secret,
    agent_id: botId,
    agent_name: probe.detail?.agentName,
    ...(token ? { token } : {}),
    ...(encodingAesKey ? { encoding_aes_key: encodingAesKey } : {}),
    ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
    bot_open_id: botId,
    probed_at: new Date().toISOString(),
  });
  logger.info(`[Channels] 企微渠道激活成功: binding=${bindingId} corp=${corpId} agent=${botId || '(webhook)'}`);
  ok(res, updated);
});

// 微信公众号凭证（真实：官方 API 探测校验后激活）
// 字段：app_id=公众号 AppID，app_secret=AppSecret，token/encoding_aes_key=服务器配置（回调用）
router.post('/:bindingId/wechat/credentials', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const appId = String(req.body?.app_id || '').trim();
  const appSecret = String(req.body?.app_secret || '').trim();
  const token = String(req.body?.token || '').trim();
  const encodingAesKey = String(req.body?.encoding_aes_key || '').trim();
  const openid = String(req.body?.openid || '').trim();
  if (!appId || !appSecret) {
    fail(res, 400, 'app_id 与 app_secret（公众号 AppID/AppSecret）均不能为空');
    return;
  }
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  const probe = await probeWeChat({ appId, appSecret });
  if (!probe.ok) {
    logger.info(`[Channels] 公众号凭证探测未通过: ${probe.error}`);
    fail(res, 400, `凭证校验失败: ${probe.error}`);
    return;
  }
  const updated = activateBindingLocal(db, bindingId, {
    app_id: appId,
    app_secret: appSecret,
    ...(token ? { token } : {}),
    ...(encodingAesKey ? { encoding_aes_key: encodingAesKey } : {}),
    ...(openid ? { openid } : {}),
    bot_open_id: openid || `mp_${appId.slice(-6)}`,
    bot_name: '公众号',
    probed_at: new Date().toISOString(),
  });
  logger.info(`[Channels] 公众号渠道激活成功: binding=${bindingId} app=${appId}`);
  ok(res, updated);
});

// 飞书凭证（demo 本地激活）
router.post('/:bindingId/feishu/credentials', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const appId = String(req.body?.app_id || '').trim();
  const appSecret = String(req.body?.app_secret || '').trim();
  if (!appId || !appSecret) {
    fail(res, 400, 'App ID 与 App Secret 均不能为空');
    return;
  }
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  const updated = activateBindingLocal(db, bindingId, {
    app_id: appId,
    bot_open_id: `ou_${appId.slice(-6)}`,
    bot_name: '数字员工',
  });
  ok(res, updated);
});

// ===================== 详情子资源 =====================
// 投递消息（复用 deliverToChannel；嵌入前端「渠道接入」投递日志、主程序工具共用）
router.post('/:bindingId/deliver', async (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  const content = String(req.body?.content || '').trim();
  if (!content) {
    fail(res, 400, 'content 不能为空');
    return;
  }
  const result = await deliverToChannel({
    tenantId,
    bindingId,
    content,
    title: req.body?.title ? String(req.body.title) : undefined,
    type: req.body?.type ? (String(req.body.type) as 'text' | 'alert' | 'card') : 'text',
    toUser: req.body?.to_user ? String(req.body.to_user) : undefined,
  });
  if (!result.ok) {
    fail(res, 400, result.error || '投递失败');
    return;
  }
  ok(res, result.delivery);
});

router.get('/:bindingId/deliveries', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const rows = db
    .prepare(
      'SELECT * FROM sd_channel_deliveries WHERE binding_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    )
    .all(bindingId, limit, offset) as any[];
  const total = (db.prepare('SELECT COUNT(*) AS c FROM sd_channel_deliveries WHERE binding_id = ?').get(bindingId) as any)
    .c;
  ok(res, {
    items: rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      agent_id: r.agent_id,
      title: r.title,
      content: r.content,
      type: r.type,
      status: r.status,
      delivered_at: isoFromUnix(r.delivered_at),
      created_at: isoFromUnix(r.created_at),
    })),
    total,
    offset,
    limit,
  });
});

router.get('/:bindingId/deliveries/days', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  ok(res, { days: [], total_days: 0, offset: 0, limit: 7 });
});

router.get('/:bindingId/conversations', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  ok(res, { items: [], total: 0, offset: 0, limit: 20 });
});

router.get('/:bindingId/conversations/:sessionId/messages', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const db = getDb();
  const binding = db.prepare('SELECT * FROM sd_channel_bindings WHERE id = ? AND tenant_id = ?').get(
    bindingId,
    tenantId,
  );
  if (!binding) {
    fail(res, 404, '渠道绑定不存在');
    return;
  }
  ok(res, []);
});

export default router;
