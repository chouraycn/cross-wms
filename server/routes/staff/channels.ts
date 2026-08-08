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
 *   POST   /:bindingId/wechat/qrcode          — 微信二维码（demo）
 *   GET    /:bindingId/wechat/qrcode-status   — 轮询扫码状态（demo 直接 confirmed）
 *   POST   /:bindingId/wecom/credentials      — 企微凭证（demo 本地激活）
 *   POST   /:bindingId/feishu/credentials     — 飞书凭证（demo 本地激活）
 *   POST   /:bindingId/deliver                — 投递消息（复用 Channel Gateway）
 *   GET    /:bindingId/deliveries             — 投递日志（读 sd_channel_deliveries）
 *   GET    /:bindingId/deliveries/days        — 按天分组（空）
 *   GET    /:bindingId/conversations          — 对话记录（空）
 *   GET    /:bindingId/conversations/:sid/messages — 会话消息（空）
 *
 * 说明：
 *   - 所有成功响应统一返回 { code:0, data, message:'ok' }；数字员工嵌入前端无 envelope
 *     unwrap，由 server/index.ts 的剥离中间件在 /api/staffdeck/* 上拆出 data（仅 code===0）。
 *   - 真实渠道服务（微信/企微/飞书长连接）不在桌面端，凭证保存走「本地 demo 激活」：
 *     存储配置并标记 active，使页面完成「接入」流程、状态可见；不发起外部连接。
 *   - 渠道描述 CHANNEL_META 即从 StaffDeck-main 后端迁移过来的「基础信息」。
 */
import { Router, type Request, type Response } from 'express';
import { initDb } from '../../db.js';
import {
  DEFAULT_TENANT_ID,
  newStaffId,
  StaffIdPrefix,
} from '../../db-staff.js';
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
}

/**
 * 将消息投递到已接入的 IM 渠道（企业微信/飞书/微信）。
 *
 * 这是「渠道反哺主程序」的核心：主程序任意 agent / automation 的执行结果，
 * 都可经此复用数字员工已配好的渠道绑定，主动推给 IM。
 *
 * 桌面端无真实 IM 网关：demo 投递 —— 写入 sd_channel_deliveries 并标记 delivered，
 * 记录即视为已送达（与凭证端点「本地 demo 激活」一致）。
 * 真实环境中接入外部网关时，只需在此处对 status='active' 且有凭证的绑定发起 HTTP 推送。
 */
export function deliverToChannel(opts: DeliverToChannelOptions): {
  ok: boolean;
  delivery?: Record<string, any>;
  error?: string;
} {
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
  db.prepare(
    `INSERT INTO sd_channel_deliveries
      (id, tenant_id, binding_id, channel, agent_id, title, content, type, status, delivered_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'delivered', ?, ?)`,
  ).run(
    id,
    tenantId,
    binding.id,
    binding.channel,
    binding.agent_id,
    opts.title || null,
    opts.content,
    type,
    t,
    t,
  );
  const row = db.prepare('SELECT * FROM sd_channel_deliveries WHERE id = ?').get(id) as any;
  return {
    ok: true,
    delivery: {
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
    },
  };
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

// 企微凭证（demo 本地激活）
router.post('/:bindingId/wecom/credentials', (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const bindingId = req.params.bindingId;
  const botId = String(req.body?.bot_id || '').trim();
  const secret = String(req.body?.secret || '').trim();
  const corpId = String(req.body?.corp_id || '').trim();
  if (!botId || !secret || !corpId) {
    fail(res, 400, 'corp_id、bot_id 与 secret 均不能为空');
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
    bot_id: botId,
    corp_id: corpId,
    bot_open_id: botId,
  });
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
router.post('/:bindingId/deliver', (req: Request, res: Response) => {
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
  const result = deliverToChannel({
    tenantId,
    bindingId,
    content,
    title: req.body?.title ? String(req.body.title) : undefined,
    type: req.body?.type ? (String(req.body.type) as 'text' | 'alert' | 'card') : 'text',
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
