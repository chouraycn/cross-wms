/**
 * StaffDeck Tools Routes — 挂载 /api/staffdeck/tools
 *
 * 端点：
 *   GET    /                  — 列表（支持 bucket 过滤）
 *   GET    /buckets           — 获取所有 bucket 聚合
 *   GET    /:tool_id          — 工具详情
 *   POST   /                  — 创建工具
 *   POST   /probe             — 探测工具（复用 /:tool_id/test 真实执行）
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
  const config = parseJson<Record<string, any>>(row.config_json, {});
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

// ===================== POST /probe — 探测工具 =====================
// 注意：此路由必须在 GET /:tool_id 之前注册

/** 根据 JSON 值推断 output_schema（对齐原版 _infer_json_schema） */
function inferJsonSchema(value: unknown): Record<string, any> {
  if (value === null) return { type: 'null' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (typeof value === 'number') return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  if (typeof value === 'string') return { type: 'string' };
  if (Array.isArray(value)) {
    return { type: 'array', items: value.length > 0 ? inferJsonSchema(value[0]) : {} };
  }
  if (typeof value === 'object' && value !== null) {
    const properties: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      properties[String(k)] = inferJsonSchema(v);
    }
    return { type: 'object', properties, required: Object.keys(properties) };
  }
  return { type: 'string' };
}

/** 根据 input_schema.properties 生成测试参数（使用 default 值，无 default 则跳过） */
function generateSampleArgs(inputSchema: unknown): Record<string, any> {
  if (!inputSchema || typeof inputSchema !== 'object') return {};
  const props = (inputSchema as Record<string, any>).properties;
  if (!props || typeof props !== 'object') return {};
  const result: Record<string, any> = {};
  for (const [key, def] of Object.entries(props as Record<string, any>)) {
    if (def && typeof def === 'object' && def.default !== undefined) {
      result[key] = def.default;
    }
  }
  return result;
}

router.post('/probe', async (req: Request, res: Response) => {
  const { tool_type, method, url, headers, auth, input_schema, sample_arguments } = req.body;
  const effectiveType = String(tool_type || 'http').toLowerCase();

  // 非 HTTP 类工具（如 mcp）：暂不支持探测，不报错
  if (effectiveType !== 'http') {
    res.json({
      code: 0,
      data: {
        implemented: false,
        success: false,
        status_code: null,
        data_preview: null,
        inferred_output_schema: {},
        error: {
          code: 'PROBE_UNSUPPORTED_TYPE',
          message: `工具探测暂不支持该类型（tool_type=${effectiveType}），仅支持 http`,
        },
      },
      message: `工具探测暂不支持该类型：${effectiveType}`,
    });
    return;
  }

  // 校验 url
  if (!url || typeof url !== 'string' || !url.trim()) {
    res.json({
      code: 0,
      data: {
        implemented: true,
        success: false,
        status_code: null,
        data_preview: null,
        inferred_output_schema: {},
        error: {
          code: 'PROBE_NO_URL',
          message: 'HTTP 工具未配置 url',
        },
      },
      message: '探测失败：缺少 url',
    });
    return;
  }

  // 复用 /:tool_id/test 的真实执行原语（fetchWithSsrFGuard + 30s 超时 + 私网放行），
  // 仅把前端传入的裸配置组装成一条临时 ToolRow，探测本质是一次性测试。
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const reqHeaders: Record<string, string> = {};
  if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      reqHeaders[k] = String(v);
    }
  }
  const synthRow: ToolRow = {
    id: 'probe',
    tenant_id: tenantId,
    name: (req.body.name as string) || 'probe',
    display_name: (req.body.display_name as string) ?? null,
    description: (req.body.description as string) ?? null,
    bucket: (req.body.bucket as string) ?? '未分桶',
    tool_type: 'http',
    method: String(method || 'POST').toUpperCase(),
    url: url as string,
    headers_json: JSON.stringify(reqHeaders),
    auth_json: JSON.stringify(auth && typeof auth === 'object' ? auth : {}),
    config_json: '{}',
    input_schema: (input_schema as string) ?? '{}',
    output_schema: (req.body.output_schema as string) ?? '{}',
    allowed_skills_json: '[]',
    mcp_server_id: null,
    mcp_tool_name: null,
    enabled: 1,
    created_at: 0,
    updated_at: 0,
  };

  // 测试参数：优先使用 sample_arguments，否则从 input_schema 推断
  const testArgs: Record<string, any> =
    sample_arguments && typeof sample_arguments === 'object'
      ? (sample_arguments as Record<string, any>)
      : generateSampleArgs(input_schema);

  try {
    const result = await runToolTest(tenantId, synthRow, testArgs);
    const output = (result.output || {}) as { status?: number; contentType?: string | null; body?: string };
    const rawBody = typeof output.body === 'string' ? output.body : null;
    let dataPreview: unknown = null;
    if (rawBody !== null) {
      try {
        dataPreview = JSON.parse(rawBody);
      } catch {
        dataPreview = rawBody.length > 1000 ? rawBody.slice(0, 1000) : rawBody;
      }
    }
    const statusCode = typeof output.status === 'number' ? output.status : null;
    const success = statusCode !== null && statusCode >= 200 && statusCode < 300;
    const inferredSchema = success && dataPreview ? inferJsonSchema(dataPreview) : {};
    const error = success
      ? null
      : (result.error || {
          code: statusCode !== null ? `HTTP_${statusCode}` : 'PROBE_ERROR',
          message: statusCode !== null ? `工具探测返回异常状态码：${statusCode}` : '工具探测失败',
        });
    res.json({
      code: 0,
      data: {
        implemented: true,
        success,
        status_code: statusCode,
        data_preview: dataPreview,
        inferred_output_schema: inferredSchema,
        error,
      },
      message: success ? '探测成功' : '探测失败：HTTP 状态码异常',
    });
  } catch (err) {
    res.json({
      code: 0,
      data: {
        implemented: true,
        success: false,
        status_code: null,
        data_preview: null,
        inferred_output_schema: {},
        error: {
          code: 'PROBE_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      },
      message: '探测失败：网络错误',
    });
  }
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
  output: any;
  error: { code: string; message: string } | null;
};

async function runToolTest(
  tenantId: string,
  row: ToolRow,
  args: Record<string, any>,
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
      let parsed: any = raw;
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

  // HTTP 工具：复用软件自带 SSRF 防护 fetch（与 /:tool_id/test 同一原语）
  if (!row.url) {
    return { success: false, output: null, error: { code: 'NO_URL', message: 'HTTP 工具未配置 url' } };
  }
  const method = (row.method || 'POST').toUpperCase();
  const headers: Record<string, string> = {};
  try {
    const parsedHeaders = JSON.parse((row.headers_json as string | null) ?? '{}');
    if (parsedHeaders && typeof parsedHeaders === 'object') {
      for (const [k, v] of Object.entries(parsedHeaders as Record<string, unknown>)) {
        headers[k] = String(v);
      }
    }
  } catch {
    /* 忽略损坏的 headers_json，沿用空头 */
  }
  let auth: { type?: string; token?: string; apiKey?: string; header?: string; username?: string; password?: string } = {};
  try {
    auth = JSON.parse((row.auth_json as string | null) ?? '{}');
  } catch {
    auth = {};
  }
  if (auth.type === 'bearer' && auth.token) {
    headers['Authorization'] = `Bearer ${auth.token}`;
  } else if (auth.type === 'apikey' && auth.apiKey) {
    headers[auth.header || 'X-API-Key'] = auth.apiKey;
  } else if (auth.type === 'basic') {
    if (auth.username !== undefined || auth.password !== undefined) {
      headers['Authorization'] = `Basic ${Buffer.from(`${auth.username ?? ''}:${auth.password ?? ''}`).toString('base64')}`;
    } else if (auth.token) {
      headers['Authorization'] = `Basic ${String(auth.token)}`;
    }
  }
  const hasBody = !['GET', 'HEAD', 'DELETE'].includes(method);
  const options: RequestInit = { method, headers };
  let targetUrl = row.url;
  if (hasBody) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    options.body = typeof args === 'string' ? args : JSON.stringify(args);
  } else if (args && typeof args === 'object' && Object.keys(args).length > 0) {
    // GET/HEAD/DELETE：把测试参数合并到 query string（与 /probe 语义一致）
    try {
      const urlObj = new URL(row.url);
      for (const [k, v] of Object.entries(args)) {
        if (v !== undefined && v !== null) urlObj.searchParams.set(k, String(v));
      }
      targetUrl = urlObj.toString();
    } catch {
      /* 非法 URL 仍按原 url 发送 */
    }
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
  const args = ((req.body.arguments ?? req.body.args) || {}) as Record<string, any>;
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
