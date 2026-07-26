/**
 * StaffDeck MCP Servers Routes — 挂载 /api/staffdeck/mcp-servers
 *
 * 端点：
 *   GET    /                       — 列表
 *   POST   /                       — 创建
 *   GET    /:server_id             — 详情
 *   PUT    /:server_id             — 更新
 *   DELETE /:server_id            — 删除
 *   POST   /discover              — 发现本地 MCP server（stub）
 *   POST   /:server_id/discover   — 发现单个 server 的工具（stub）
 *   POST   /:server_id/sync       — 同步工具到 sd_tools 表（stub）
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { McpServerRow, McpServerRead } from '../../types/staff.js';
import * as mcpServerDao from '../../dao/staff/staffMcpServerDao.js';
import * as toolDao from '../../dao/staff/staffToolDao.js';

const router = Router();

// ===================== Row → Read 转换 =====================

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mcpServerRead(row: McpServerRow): McpServerRead {
  const tools = toolDao.getToolsByMcpServer(row.id);
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    display_name: row.display_name,
    description: row.description,
    bucket: row.bucket || 'MCP 工具',
    transport: row.transport,
    url: row.url,
    headers: parseJson(row.headers_json, {}),
    command: row.command,
    args: parseJson(row.args_json, []),
    env: parseJson(row.env_json, {}),
    cwd: row.cwd,
    discovered_tools: parseJson(row.discovered_tools_json, []),
    last_synced_at: row.last_synced_at,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** 连接配置：从请求体提取（兼容扁平/嵌套结构） */
interface ConnectionInput {
  transport?: string;
  url?: string | null;
  headers?: Record<string, unknown>;
  command?: string | null;
  args?: string[];
  env?: Record<string, unknown>;
  cwd?: string | null;
}

// ===================== GET / — 列表 =====================

router.get('/', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const rows = mcpServerDao.listMcpServers(tenantId);
  res.json({ code: 0, data: rows.map(mcpServerRead), message: 'ok' });
});

// ===================== POST / — 创建 =====================

router.post('/', (req: Request, res: Response) => {
  const {
    name,
    display_name,
    description,
    bucket,
    enabled,
    connection,
  } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'name 不能为空' });
    return;
  }

  const tenantId = (req.body.tenant_id as string) || DEFAULT_TENANT_ID;
  const conn = (connection ?? {}) as ConnectionInput;

  try {
    const row = mcpServerDao.createMcpServer({
      tenant_id: tenantId,
      name: name.trim(),
      display_name: display_name ?? null,
      description: description ?? null,
      bucket,
      transport: conn.transport,
      url: conn.url ?? null,
      headers: conn.headers,
      command: conn.command ?? null,
      args: conn.args,
      env: conn.env,
      cwd: conn.cwd ?? null,
      enabled,
    });
    res.status(201).json({ code: 0, data: mcpServerRead(row), message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ code: 409, data: null, message: 'MCP 服务器名称已存在' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message });
  }
});

// ===================== POST /discover — 发现本地 MCP server（stub） =====================
// 注意：此路由必须在 GET /:server_id 之前注册

router.post('/discover', (req: Request, res: Response) => {
  // TODO: 接入真实 MCP discover 逻辑（list_mcp_tools）
  res.json({
    code: 0,
    data: {
      success: true,
      tools: [],
      error: null,
    },
    message: 'ok',
  });
});

// ===================== GET /:server_id — 详情 =====================

router.get('/:server_id', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = mcpServerDao.getMcpServerById(tenantId, req.params.server_id);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'MCP 服务器不存在' });
    return;
  }
  res.json({ code: 0, data: mcpServerRead(row), message: 'ok' });
});

// ===================== PUT /:server_id — 更新 =====================

router.put('/:server_id', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const {
    name,
    display_name,
    description,
    bucket,
    enabled,
    connection,
  } = req.body;
  const conn = (connection ?? {}) as ConnectionInput;

  try {
    const row = mcpServerDao.updateMcpServer(tenantId, req.params.server_id, {
      name,
      display_name: display_name ?? null,
      description: description ?? null,
      bucket,
      transport: conn.transport,
      url: conn.url ?? null,
      headers: conn.headers,
      command: conn.command ?? null,
      args: conn.args,
      env: conn.env,
      cwd: conn.cwd ?? null,
      enabled,
    });
    if (!row) {
      res.status(404).json({ code: 404, data: null, message: 'MCP 服务器不存在' });
      return;
    }
    res.json({ code: 0, data: mcpServerRead(row), message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ code: 409, data: null, message: 'MCP 服务器名称已存在' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message });
  }
});

// ===================== DELETE /:server_id — 删除 =====================

router.delete('/:server_id', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const removeTools = req.query.remove_tools !== 'false';
  const ok = mcpServerDao.deleteMcpServer(tenantId, req.params.server_id, removeTools);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: 'MCP 服务器不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== POST /:server_id/discover — 发现单个 server 的工具（stub） =====================

router.post('/:server_id/discover', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = mcpServerDao.getMcpServerById(tenantId, req.params.server_id);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'MCP 服务器不存在' });
    return;
  }
  // TODO: 接入真实 MCP discover（list_mcp_tools），更新 discovered_tools_json
  res.json({
    code: 0,
    data: {
      success: true,
      tools: [],
      error: null,
    },
    message: 'ok',
  });
});

// ===================== POST /:server_id/sync — 同步工具到 sd_tools 表（stub） =====================

router.post('/:server_id/sync', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = mcpServerDao.getMcpServerById(tenantId, req.params.server_id);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'MCP 服务器不存在' });
    return;
  }
  // TODO: 接入真实 sync 逻辑（discovery → 落库为 Tool 行）
  const now = Math.floor(Date.now() / 1000);
  mcpServerDao.updateMcpServer(tenantId, row.id, { last_synced_at: now });
  res.json({
    code: 0,
    data: {
      success: true,
      imported: [],
      updated: [],
      removed: [],
    },
    message: 'ok',
  });
});

export default router;
