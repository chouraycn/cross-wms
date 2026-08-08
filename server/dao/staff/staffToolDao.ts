/**
 * StaffDeck Tool DAO — sd_tools 表 CRUD
 *
 * 设计：
 * - DAO 函数返回纯数据（ToolRow），不做 Row→Read 转换（由路由层负责）
 * - JSON 字段以 TEXT 存储，DAO 负责 JSON.stringify 序列化
 * - 布尔字段使用 0/1
 * - 时间字段使用 INTEGER（Unix 秒）
 */
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix, DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { ToolRow } from '../../types/staff.js';

// ===================== 查询 =====================

/** 列出某租户下的全部工具，支持按 bucket 过滤 */
export function listTools(tenantId: string = DEFAULT_TENANT_ID, bucket?: string): ToolRow[] {
  const db = initDb();
  if (bucket && bucket !== '__all') {
    return db
      .prepare('SELECT * FROM sd_tools WHERE tenant_id = ? AND bucket = ? ORDER BY created_at DESC')
      .all(tenantId, bucket) as ToolRow[];
  }
  return db
    .prepare('SELECT * FROM sd_tools WHERE tenant_id = ? ORDER BY created_at DESC')
    .all(tenantId) as ToolRow[];
}

/** 按 bucket 聚合统计 */
export function listToolBuckets(
  tenantId: string = DEFAULT_TENANT_ID,
): Array<{ bucket: string; total: number; enabled_count: number; disabled_count: number; tool_ids: string[] }> {
  const rows = listTools(tenantId);
  const grouped = new Map<string, { bucket: string; total: number; enabled_count: number; disabled_count: number; tool_ids: string[] }>();
  for (const row of rows) {
    const bucket = row.bucket || '未分桶';
    let item = grouped.get(bucket);
    if (!item) {
      item = { bucket, total: 0, enabled_count: 0, disabled_count: 0, tool_ids: [] };
      grouped.set(bucket, item);
    }
    item.total += 1;
    if (row.enabled) item.enabled_count += 1;
    else item.disabled_count += 1;
    item.tool_ids.push(row.id);
  }
  return Array.from(grouped.values()).sort((a, b) => b.total - a.total || a.bucket.localeCompare(b.bucket));
}

/** 按 ID 获取单个工具 */
export function getToolById(tenantId: string = DEFAULT_TENANT_ID, toolId: string): ToolRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_tools WHERE tenant_id = ? AND id = ?')
    .get(tenantId, toolId) as ToolRow | undefined;
}

/** 按 MCP server 获取工具列表 */
export function getToolsByMcpServer(serverId: string): ToolRow[] {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_tools WHERE mcp_server_id = ? ORDER BY created_at DESC')
    .all(serverId) as ToolRow[];
}

/** 按 (mcp_server_id, config.tool) 叶子名查找工具 */
export function getServerToolByLeafName(serverId: string, leafName: string): ToolRow | undefined {
  const db = initDb();
  const rows = db
    .prepare('SELECT * FROM sd_tools WHERE mcp_server_id = ?')
    .all(serverId) as ToolRow[];
  return rows.find((row) => {
    try {
      const config = JSON.parse(row.config_json || '{}') as Record<string, any>;
      return String(config.tool || '').trim() === leafName;
    } catch {
      return false;
    }
  });
}

/** 按 config.skillId 查找「程序技能」类工具（tool_type='skill'） */
export function getToolByConfigSkillId(tenantId: string, skillId: string): ToolRow | undefined {
  const db = initDb();
  const rows = db
    .prepare('SELECT * FROM sd_tools WHERE tenant_id = ? AND tool_type = ?')
    .all(tenantId, 'skill') as ToolRow[];
  return rows.find((row) => {
    try {
      const config = JSON.parse(row.config_json || '{}') as Record<string, any>;
      return String(config.skillId || '') === skillId;
    } catch {
      return false;
    }
  });
}

// ===================== 写入 =====================

interface CreateToolData {
  tenant_id?: string;
  name: string;
  display_name?: string | null;
  description?: string | null;
  bucket?: string;
  tool_type?: string;
  method: string;
  url: string;
  headers?: Record<string, any>;
  auth?: Record<string, any>;
  config?: Record<string, any>;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  allowed_skills?: string[];
  mcp_server_id?: string | null;
  mcp_tool_name?: string | null;
  enabled?: boolean;
}

/** 创建工具 */
export function createTool(data: CreateToolData): ToolRow {
  const db = initDb();
  const id = newStaffId(StaffIdPrefix.tool);
  const tenantId = data.tenant_id || DEFAULT_TENANT_ID;
  const bucket = (data.bucket || '').trim() || '未分桶';
  db.prepare(
    `INSERT INTO sd_tools (
      id, tenant_id, name, display_name, description, bucket, tool_type, method, url,
      headers_json, auth_json, config_json, input_schema, output_schema, allowed_skills_json,
      mcp_server_id, mcp_tool_name, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    data.name,
    data.display_name ?? null,
    data.description ?? null,
    bucket,
    data.tool_type || 'http',
    data.method,
    data.url,
    JSON.stringify(data.headers ?? {}),
    JSON.stringify(data.auth ?? {}),
    JSON.stringify(data.config ?? {}),
    JSON.stringify(data.input_schema ?? {}),
    JSON.stringify(data.output_schema ?? {}),
    JSON.stringify(data.allowed_skills ?? []),
    data.mcp_server_id ?? null,
    data.mcp_tool_name ?? null,
    data.enabled === false ? 0 : 1,
  );
  return db.prepare('SELECT * FROM sd_tools WHERE id = ?').get(id) as ToolRow;
}

interface UpdateToolData {
  name?: string;
  display_name?: string | null;
  description?: string | null;
  bucket?: string;
  tool_type?: string;
  method?: string;
  url?: string;
  headers?: Record<string, any>;
  auth?: Record<string, any>;
  config?: Record<string, any>;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
  allowed_skills?: string[];
  mcp_server_id?: string | null;
  mcp_tool_name?: string | null;
  enabled?: boolean;
}

/** 更新工具（部分更新） */
export function updateTool(
  tenantId: string = DEFAULT_TENANT_ID,
  toolId: string,
  updates: UpdateToolData,
): ToolRow | undefined {
  const db = initDb();
  const existing = getToolById(tenantId, toolId);
  if (!existing) return undefined;

  const setClauses: string[] = ['updated_at = CAST(strftime(\'%s\',\'now\') AS INTEGER)'];
  const params: any[] = [];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    params.push(updates.name);
  }
  if (updates.display_name !== undefined) {
    setClauses.push('display_name = ?');
    params.push(updates.display_name);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description);
  }
  if (updates.bucket !== undefined) {
    setClauses.push('bucket = ?');
    params.push((updates.bucket || '').trim() || '未分桶');
  }
  if (updates.tool_type !== undefined) {
    setClauses.push('tool_type = ?');
    params.push(updates.tool_type);
  }
  if (updates.method !== undefined) {
    setClauses.push('method = ?');
    params.push(updates.method);
  }
  if (updates.url !== undefined) {
    setClauses.push('url = ?');
    params.push(updates.url);
  }
  if (updates.headers !== undefined) {
    setClauses.push('headers_json = ?');
    params.push(JSON.stringify(updates.headers));
  }
  if (updates.auth !== undefined) {
    setClauses.push('auth_json = ?');
    params.push(JSON.stringify(updates.auth));
  }
  if (updates.config !== undefined) {
    setClauses.push('config_json = ?');
    params.push(JSON.stringify(updates.config));
  }
  if (updates.input_schema !== undefined) {
    setClauses.push('input_schema = ?');
    params.push(JSON.stringify(updates.input_schema));
  }
  if (updates.output_schema !== undefined) {
    setClauses.push('output_schema = ?');
    params.push(JSON.stringify(updates.output_schema));
  }
  if (updates.allowed_skills !== undefined) {
    setClauses.push('allowed_skills_json = ?');
    params.push(JSON.stringify(updates.allowed_skills));
  }
  if (updates.mcp_server_id !== undefined) {
    setClauses.push('mcp_server_id = ?');
    params.push(updates.mcp_server_id);
  }
  if (updates.mcp_tool_name !== undefined) {
    setClauses.push('mcp_tool_name = ?');
    params.push(updates.mcp_tool_name);
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }

  params.push(tenantId, toolId);
  db.prepare(`UPDATE sd_tools SET ${setClauses.join(', ')} WHERE tenant_id = ? AND id = ?`).run(...params);
  return getToolById(tenantId, toolId);
}

/** 删除工具 */
export function deleteTool(tenantId: string = DEFAULT_TENANT_ID, toolId: string): boolean {
  const db = initDb();
  const result = db
    .prepare('DELETE FROM sd_tools WHERE tenant_id = ? AND id = ?')
    .run(tenantId, toolId);
  return result.changes > 0;
}

/** 按 MCP server 删除所有关联工具 */
export function deleteToolsByMcpServer(serverId: string): number {
  const db = initDb();
  const result = db.prepare('DELETE FROM sd_tools WHERE mcp_server_id = ?').run(serverId);
  return result.changes;
}
