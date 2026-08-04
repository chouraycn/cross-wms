/**
 * StaffDeck Tools Routes — 挂载 /api/staffdeck/tools
 *
 * 端点：
 *   GET    /                  — 列表（支持 bucket 过滤）
 *   GET    /buckets           — 获取所有 bucket 聚合
 *   GET    /:tool_id          — 工具详情
 *   POST   /                  — 创建工具
 *   POST   /probe             — 探测工具（stub）
 *   PUT    /:tool_id          — 更新工具
 *   DELETE /:tool_id          — 删除工具
 *   POST   /:tool_id/test     — 测试工具调用（真实执行）
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { ToolRow, ToolRead } from '../../types/staff.js';
import * as toolDao from '../../dao/staff/staffToolDao.js';
import * as mcpServerDao from '../../engine/mcpConfigStore.js';
import { fetchWithSsrFGuard } from '../../infra/net/fetch-guard.js';
import { DEFAULT_SSRF_POLICY } from '../../infra/net/ssrf.js';
import { buildStaffMcpManager } from '../../staff/staffMcpClientManager.js';
import { makeMcpToolName } from '../../engine/mcpTypes.js';

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

function toolRead(row: ToolRow): ToolRead {
  const config = parseJson<Record<string, unknown>>(row.config_json, {});
  // 对齐原版 tools.py:76 —— mcp_config 为 config 剔除 execution 键后的剩余部分。
  const { execution: _execution, ...mcpConfig } = config;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    display_name: row.display_name,
    description: row.description,
    bucket: row.bucket || '未分桶',
    tool_type: row.tool_type || 'http',
    method: row.method,
    url: row.url,
    headers: parseJson(row.headers_json, {}),
    auth: parseJson(row.auth_json, {}),
    config: parseJson(row.config_json, {}),
    mcp_config: mcpConfig,
    input_schema: parseJson(row.input_schema, {}),
    output_schema: parseJson(row.output_schema, {}),
    allowed_skills: parseJson(row.allowed_skills_json, []),
    mcp_server_id: row.mcp_server_id,
    mcp_tool_name: row.mcp_tool_name,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ===================== GET / — 列表 =====================

router.get('/', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const bucket = req.query.bucket as string | undefined;
  const rows = toolDao.listTools(tenantId, bucket);
  res.json({ code: 0, data: rows.map(toolRead), message: 'ok' });
});

// ===================== GET /buckets — bucket 聚合 =====================
// 注意：此路由必须在 GET /:tool_id 之前注册

router.get('/buckets', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const data = toolDao.listToolBuckets(tenantId);
  res.json({ code: 0, data, message: 'ok' });
});

// ===================== POST /probe — 探测工具（功能未接入） =====================
// 注意：此路由必须在 GET /:tool_id 之前注册

router.post('/probe', (req: Request, res: Response) => {
  const { tool_type } = req.body;
  res.json({
    code: 0,
    data: {
      implemented: false,
      success: false,
      status_code: null,
      data_preview: null,
      inferred_output_schema: {},
      error: {
        code: 'PROBE_NOT_IMPLEMENTED',
        message: `工具探测功能尚未实现（tool_type=${tool_type || 'http'}）`,
      },
    },
    message: '功能未接入：工具探测尚未实现',
  });
});

// ===================== GET /:tool_id — 详情 =====================

router.get('/:tool_id', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = toolDao.getToolById(tenantId, req.params.tool_id);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '工具不存在' });
    return;
  }
  res.json({ code: 0, data: toolRead(row), message: 'ok' });
});

// ===================== POST / — 创建 =====================

router.post('/', (req: Request, res: Response) => {
  const {
    name,
    display_name,
    description,
    bucket,
    tool_type,
    method,
    url,
    headers,
    auth,
    config,
    input_schema,
    output_schema,
    allowed_skills,
    mcp_server_id,
    enabled,
  } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'name 不能为空' });
    return;
  }
  if (!method || typeof method !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'method 不能为空' });
    return;
  }
  if (!url || typeof url !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'url 不能为空' });
    return;
  }

  const tenantId = (req.body.tenant_id as string) || DEFAULT_TENANT_ID;

  try {
    const row = toolDao.createTool({
      tenant_id: tenantId,
      name: name.trim(),
      display_name: display_name ?? null,
      description: description ?? null,
      bucket,
      tool_type,
      method,
      url,
      headers,
      auth,
      config,
      input_schema,
      output_schema,
      allowed_skills,
      mcp_server_id,
      enabled,
    });
    res.status(201).json({ code: 0, data: toolRead(row), message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ code: 409, data: null, message: '工具名称已存在' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message });
  }
});

// ===================== PUT /:tool_id — 更新 =====================

router.put('/:tool_id', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const {
    name,
    display_name,
    description,
    bucket,
    tool_type,
    method,
    url,
    headers,
    auth,
    config,
    input_schema,
    output_schema,
    allowed_skills,
    mcp_server_id,
    enabled,
  } = req.body;

  try {
    const row = toolDao.updateTool(tenantId, req.params.tool_id, {
      name,
      display_name,
      description,
      bucket,
      tool_type,
      method,
      url,
      headers,
      auth,
      config,
      input_schema,
      output_schema,
      allowed_skills,
      mcp_server_id,
      enabled,
    });
    if (!row) {
      res.status(404).json({ code: 404, data: null, message: '工具不存在' });
      return;
    }
    res.json({ code: 0, data: toolRead(row), message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ code: 409, data: null, message: '工具名称已存在' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message });
  }
});

// ===================== DELETE /:tool_id — 删除 =====================

router.delete('/:tool_id', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const ok = toolDao.deleteTool(tenantId, req.params.tool_id);
  if (!ok) {
    res.status(404).json({ code: 404, data: null, message: '工具不存在' });
    return;
  }
  res.json({ code: 0, data: null, message: 'ok' });
});

// ===================== POST /:tool_id/test — 测试工具调用（真实执行） =====================
// 复用软件既有能力：HTTP 工具走 fetchWithSsrFGuard（带 SSRF 防护），
// MCP 工具走 buildStaffMcpManager 的真实 MCP 客户端，避免平行重造。

type ToolTestResult = {
  success: boolean;
  output: unknown;
  error: { code: string; message: string } | null;
};

async function runToolTest(
  tenantId: string,
  row: ToolRow,
  args: Record<string, unknown>,
): Promise<ToolTestResult> {
  // MCP 工具：复用员工隔离 MCP 客户端管理器
  if (row.mcp_server_id && row.mcp_tool_name) {
    const serverRow = mcpServerDao.getMcpServerById(tenantId, row.mcp_server_id);
    if (!serverRow) {
      return { success: false, output: null, error: { code: 'MCP_SERVER_NOT_FOUND', message: '父 MCP 服务器不存在' } };
    }
    const manager = await buildStaffMcpManager(tenantId);
    if (!manager) {
      return { success: false, output: null, error: { code: 'MCP_NO_CONNECTION', message: '无可用 MCP 连接' } };
    }
    try {
      const fullName = makeMcpToolName(serverRow.name, row.mcp_tool_name);
      const raw = await manager.executeMcpTool(fullName, args);
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw as string);
      } catch {
        /* 非 JSON 文本原样保留 */
      }
      return { success: true, output: parsed, error: null };
    } catch (err) {
      return {
        success: false,
        output: null,
        error: { code: 'MCP_CALL_FAILED', message: err instanceof Error ? err.message : String(err) },
      };
    } finally {
      await manager.disconnectAll().catch(() => undefined);
    }
  }

  // HTTP 工具：复用软件自带 SSRF 防护 fetch
  if (!row.url) {
    return { success: false, output: null, error: { code: 'NO_URL', message: 'HTTP 工具未配置 url' } };
  }
  const method = (row.method || 'POST').toUpperCase();
  const headers: Record<string, string> = { ...(((row.headers_json as string | null) ?? '{}') as unknown as Record<string, string>) };
  const auth = (((row.auth_json as string | null) ?? '{}') as unknown as { type?: string; token?: string; apiKey?: string; header?: string });
  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth.type === 'apikey' && auth.apiKey) {
    headers[auth.header || 'X-API-Key'] = auth.apiKey;
  }
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method);
  const options: RequestInit = { method, headers };
  if (hasBody) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    options.body = typeof args === 'string' ? args : JSON.stringify(args);
  }
  try {
    // 工具为用户自有配置（自托管服务），放行私有网络访问，但仍走 SSRF 防护（DNS 钉扎 + 响应体限制）
    const guarded = {
      url: row.url,
      options,
      policy: { ...DEFAULT_SSRF_POLICY, dangerouslyAllowPrivateNetwork: true },
      timeoutMs: 30_000,
    };
    const result = await fetchWithSsrFGuard(guarded);
    const resp = result.response;
    const respText = await resp.text();
    const ok = resp.status >= 200 && resp.status < 300;
    return {
      success: ok,
      output: { status: resp.status, contentType: resp.headers.get('content-type'), body: respText },
      error: ok ? null : { code: `HTTP_${resp.status}`, message: respText },
    };
  } catch (err) {
    return {
      success: false,
      output: null,
      error: { code: 'HTTP_REQUEST_FAILED', message: err instanceof Error ? err.message : String(err) },
    };
  }
}

router.post('/:tool_id/test', async (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = toolDao.getToolById(tenantId, req.params.tool_id);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '工具不存在' });
    return;
  }
  const args = ((req.body.arguments ?? req.body.args) || {}) as Record<string, unknown>;
  try {
    const result = await runToolTest(tenantId, row, args);
    res.json({ code: 0, data: result, message: 'ok' });
  } catch (err) {
    res.json({
      code: 0,
      data: { success: false, output: null, error: { code: 'TEST_ERROR', message: err instanceof Error ? err.message : String(err) } },
      message: 'ok',
    });
  }
});

export default router;
