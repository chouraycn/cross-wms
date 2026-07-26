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
 *   POST   /:tool_id/test     — 测试工具调用（stub）
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { ToolRow, ToolRead } from '../../types/staff.js';
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

function toolRead(row: ToolRow): ToolRead {
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
    input_schema: parseJson(row.input_schema, {}),
    output_schema: parseJson(row.output_schema, {}),
    allowed_skills: parseJson(row.allowed_skills_json, []),
    mcp_server_id: row.mcp_server_id,
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

// ===================== POST /probe — 探测工具（stub） =====================
// 注意：此路由必须在 GET /:tool_id 之前注册

router.post('/probe', (req: Request, res: Response) => {
  // TODO: 接入真实 HTTP/MCP 探测逻辑
  const { tool_type } = req.body;
  res.json({
    code: 0,
    data: {
      success: false,
      status_code: null,
      data_preview: null,
      inferred_output_schema: {},
      error: {
        code: 'PROBE_NOT_IMPLEMENTED',
        message: `工具探测功能尚未实现（tool_type=${tool_type || 'http'}）`,
      },
    },
    message: 'ok',
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

// ===================== POST /:tool_id/test — 测试工具调用（stub） =====================

router.post('/:tool_id/test', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const row = toolDao.getToolById(tenantId, req.params.tool_id);
  if (!row) {
    res.status(404).json({ code: 404, data: null, message: '工具不存在' });
    return;
  }
  // TODO: 接入真实工具执行器
  res.json({
    code: 0,
    data: {
      success: false,
      error: {
        code: 'TEST_NOT_IMPLEMENTED',
        message: `工具 ${row.name} 的测试调用尚未实现`,
      },
    },
    message: 'ok',
  });
});

export default router;
