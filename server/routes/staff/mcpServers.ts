/**
 * StaffDeck MCP Servers Routes — 挂载 /api/staffdeck/mcp-servers
 *
 * 端点：
 *   GET    /                       — 列表
 *   POST   /                       — 创建
 *   GET    /:server_id             — 详情
 *   PUT    /:server_id             — 更新
 *   DELETE /:server_id            — 删除
 *   POST   /discover              — 扫描全局 ~/.workbuddy/mcp.json 返回候选 MCP 服务器
 *   POST   /:server_id/discover   — 发现单个 server 的工具（真实连接）
 *   POST   /:server_id/sync       — 同步工具到 sd_tools 表（真实连接 + upsert）
 */
import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { McpServerRow, McpServerRead } from '../../types/staff.js';
import * as mcpServerDao from '../../engine/mcpConfigStore.js';
import * as toolDao from '../../dao/staff/staffToolDao.js';
import { discoverMcpTools, type McpConnectionConfig } from '../../staff/mcpDiscovery.js';

const router = Router();

/** 全局 MCP 配置文件（CrossWMS 主应用的 MCP 连接配置） */
const GLOBAL_MCP_CONFIG = path.join(os.homedir(), '.workbuddy', 'mcp.json');

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
  const headers = parseJson<Record<string, string>>(row.headers_json, {});
  const args = parseJson<string[]>(row.args_json, []);
  const env = parseJson<Record<string, string>>(row.env_json, {});
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    display_name: row.display_name,
    description: row.description,
    bucket: row.bucket || 'MCP 工具',
    // 前端 ToolsPage 直接读 row.connection.transport，缺失会抛 TypeError 白屏。
    // 扁平字段同时保留，兼容既有内部调用方。
    connection: {
      transport: row.transport,
      url: row.url,
      headers,
      command: row.command,
      args,
      env,
      cwd: row.cwd,
    },
    transport: row.transport,
    url: row.url,
    headers,
    command: row.command,
    args,
    env,
    cwd: row.cwd,
    discovered_tools: parseJson(row.discovered_tools_json, []),
    last_synced_at: row.last_synced_at,
    enabled: row.enabled === 1,
    tool_count: tools.length,
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

// ===================== POST /discover — 扫描全局 MCP 配置返回候选服务器 =====================
// 注意：此路由必须在 GET /:server_id 之前注册

router.post('/discover', (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(GLOBAL_MCP_CONFIG)) {
      res.json({
        code: 0,
        data: {
          implemented: true,
          success: true,
          servers: [],
          note: '未检测到全局 MCP 配置文件（~/.workbuddy/mcp.json）',
        },
        message: 'ok',
      });
      return;
    }
    const raw = JSON.parse(fs.readFileSync(GLOBAL_MCP_CONFIG, 'utf-8')) as {
      mcpServers?: Record<string, Record<string, unknown>>;
    };
    const entries = raw.mcpServers ?? {};
    const servers = Object.entries(entries).map(([name, cfg]) => {
      const url = cfg.url as string | undefined;
      const command = cfg.command as string | undefined;
      let transport = 'unknown';
      if (url) {
        transport = String(url).includes('sse') ? 'sse' : 'streamable_http';
      } else if (command) {
        transport = 'stdio';
      }
      return {
        name,
        transport,
        url: url ?? null,
        command: command ?? null,
        args: (cfg.args as string[]) ?? [],
        headers: (cfg.headers as Record<string, unknown>) ?? {},
        description: `从全局配置导入的 MCP 服务器：${name}`,
      };
    });
    res.json({
      code: 0,
      data: { implemented: true, success: true, servers },
      message: 'ok',
    });
  } catch (e) {
    res.json({
      code: 0,
      data: { implemented: true, success: false, servers: [], error: (e as Error).message },
      message: '读取全局 MCP 配置失败',
    });
  }
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

// ===================== 连接配置转换 =====================

function toConnectionConfig(row: McpServerRow): McpConnectionConfig {
  return {
    transport: row.transport,
    url: row.url,
    headers: parseJson(row.headers_json, {}),
    command: row.command,
    args: parseJson(row.args_json, []),
    env: parseJson(row.env_json, {}),
    cwd: row.cwd,
  };
}

function leafNameFromConfig(configJson: string | null): string {
  try {
    return String((JSON.parse(configJson || '{}') as Record<string, unknown>).tool || '');
  } catch {
    return '';
  }
}

// ===================== POST /:server_id/discover — 发现单个 server 的工具（真实连接） =====================

router.post('/:server_id/discover', async (req: Request, res: Response) => {
  const tenantId = (req.body?.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = mcpServerDao.getMcpServerById(tenantId, req.params.server_id);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'MCP 服务器不存在' });
    return;
  }
  const result = await discoverMcpTools(toConnectionConfig(row));
  res.json({
    code: 0,
    data: {
      ...result,
      server_id: row.id,
      server_name: row.name,
    },
    message: result.success ? 'ok' : (result.error || 'MCP 工具发现失败'),
  });
});

// ===================== POST /:server_id/sync — 同步工具到 sd_tools 表（真实连接 + upsert） =====================

router.post('/:server_id/sync', async (req: Request, res: Response) => {
  const tenantId = (req.body?.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = mcpServerDao.getMcpServerById(tenantId, req.params.server_id);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: 'MCP 服务器不存在' });
    return;
  }

  const result = await discoverMcpTools(toConnectionConfig(row));
  if (!result.success) {
    res.json({
      code: 0,
      data: {
        implemented: true,
        success: false,
        imported: [],
        updated: [],
        removed: [],
        error: result.error,
      },
      message: result.error || 'MCP 工具同步失败',
    });
    return;
  }

  const imported: string[] = [];
  const updated: string[] = [];
  const seenLeafNames = new Set<string>();

  for (const tool of result.tools) {
    const leafName = tool.name;
    seenLeafNames.add(leafName);
    const catalogName = `mcp__${row.name}__${tool.name}`;
    const base = {
      name: catalogName,
      display_name: tool.name,
      description: tool.description ?? null,
      bucket: row.bucket || 'MCP 工具',
      tool_type: 'mcp',
      method: 'mcp',
      url: '',
      headers: {},
      auth: {},
      config: { tool: leafName },
      input_schema: tool.input_schema,
      output_schema: {},
      allowed_skills: [],
      mcp_server_id: row.id,
      mcp_tool_name: tool.name,
      enabled: true,
    };
    const existing = toolDao.getServerToolByLeafName(row.id, leafName);
    if (existing) {
      toolDao.updateTool(tenantId, existing.id, base);
      updated.push(existing.id);
    } else {
      const created = toolDao.createTool({ tenant_id: tenantId, ...base });
      imported.push(created.id);
    }
  }

  // 清理已不在 MCP server 中的旧工具
  const removed: string[] = [];
  const existingTools = toolDao.getToolsByMcpServer(row.id);
  for (const t of existingTools) {
    const leafName = leafNameFromConfig(t.config_json);
    if (leafName && !seenLeafNames.has(leafName)) {
      toolDao.deleteTool(tenantId, t.id);
      removed.push(t.id);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  mcpServerDao.updateMcpServer(tenantId, row.id, {
    discovered_tools: result.tools,
    last_synced_at: now,
  });

  res.json({
    code: 0,
    data: {
      implemented: true,
      success: true,
      imported,
      updated,
      removed,
      tools: result.tools.length,
    },
    message: 'ok',
  });
});

export default router;
