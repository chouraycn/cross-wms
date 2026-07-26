/**
 * StaffDeck MCP Server DAO — sd_mcp_servers 表 CRUD
 *
 * 包含 discovered_tools_json 字段的序列化处理。
 */
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix, DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { McpServerRow } from '../../types/staff.js';

// ===================== 查询 =====================

/** 列出某租户下的全部 MCP 服务器 */
export function listMcpServers(tenantId: string = DEFAULT_TENANT_ID): McpServerRow[] {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_mcp_servers WHERE tenant_id = ? ORDER BY name ASC')
    .all(tenantId) as McpServerRow[];
}

/** 按 ID 获取单个 MCP 服务器 */
export function getMcpServerById(
  tenantId: string = DEFAULT_TENANT_ID,
  serverId: string,
): McpServerRow | undefined {
  const db = initDb();
  return db
    .prepare('SELECT * FROM sd_mcp_servers WHERE tenant_id = ? AND id = ?')
    .get(tenantId, serverId) as McpServerRow | undefined;
}

// ===================== 写入 =====================

interface CreateMcpServerData {
  tenant_id?: string;
  name: string;
  display_name?: string | null;
  description?: string | null;
  bucket?: string;
  transport?: string;
  url?: string | null;
  headers?: Record<string, unknown>;
  command?: string | null;
  args?: string[];
  env?: Record<string, unknown>;
  cwd?: string | null;
  enabled?: boolean;
}

/** 创建 MCP 服务器 */
export function createMcpServer(data: CreateMcpServerData): McpServerRow {
  const db = initDb();
  const id = newStaffId(StaffIdPrefix.mcpServer);
  const tenantId = data.tenant_id || DEFAULT_TENANT_ID;
  const bucket = (data.bucket || '').trim() || 'MCP 工具';
  db.prepare(
    `INSERT INTO sd_mcp_servers (
      id, tenant_id, name, display_name, description, bucket, transport, url,
      headers_json, command, args_json, env_json, cwd, discovered_tools_json, enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    data.name,
    data.display_name ?? null,
    data.description ?? null,
    bucket,
    data.transport || 'streamable_http',
    data.url ?? null,
    JSON.stringify(data.headers ?? {}),
    data.command ?? null,
    JSON.stringify(data.args ?? []),
    JSON.stringify(data.env ?? {}),
    data.cwd ?? null,
    '[]',
    data.enabled === false ? 0 : 1,
  );
  return db.prepare('SELECT * FROM sd_mcp_servers WHERE id = ?').get(id) as McpServerRow;
}

interface UpdateMcpServerData {
  name?: string;
  display_name?: string | null;
  description?: string | null;
  bucket?: string;
  transport?: string;
  url?: string | null;
  headers?: Record<string, unknown>;
  command?: string | null;
  args?: string[];
  env?: Record<string, unknown>;
  cwd?: string | null;
  discovered_tools?: unknown[];
  last_synced_at?: number | null;
  enabled?: boolean;
}

/** 更新 MCP 服务器（部分更新） */
export function updateMcpServer(
  tenantId: string = DEFAULT_TENANT_ID,
  serverId: string,
  updates: UpdateMcpServerData,
): McpServerRow | undefined {
  const db = initDb();
  const existing = getMcpServerById(tenantId, serverId);
  if (!existing) return undefined;

  const setClauses: string[] = ['updated_at = CAST(strftime(\'%s\',\'now\') AS INTEGER)'];
  const params: unknown[] = [];

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
    params.push((updates.bucket || '').trim() || 'MCP 工具');
  }
  if (updates.transport !== undefined) {
    setClauses.push('transport = ?');
    params.push(updates.transport);
  }
  if (updates.url !== undefined) {
    setClauses.push('url = ?');
    params.push(updates.url);
  }
  if (updates.headers !== undefined) {
    setClauses.push('headers_json = ?');
    params.push(JSON.stringify(updates.headers));
  }
  if (updates.command !== undefined) {
    setClauses.push('command = ?');
    params.push(updates.command);
  }
  if (updates.args !== undefined) {
    setClauses.push('args_json = ?');
    params.push(JSON.stringify(updates.args));
  }
  if (updates.env !== undefined) {
    setClauses.push('env_json = ?');
    params.push(JSON.stringify(updates.env));
  }
  if (updates.cwd !== undefined) {
    setClauses.push('cwd = ?');
    params.push(updates.cwd);
  }
  if (updates.discovered_tools !== undefined) {
    setClauses.push('discovered_tools_json = ?');
    params.push(JSON.stringify(updates.discovered_tools));
  }
  if (updates.last_synced_at !== undefined) {
    setClauses.push('last_synced_at = ?');
    params.push(updates.last_synced_at);
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }

  params.push(tenantId, serverId);
  db.prepare(`UPDATE sd_mcp_servers SET ${setClauses.join(', ')} WHERE tenant_id = ? AND id = ?`).run(...params);
  return getMcpServerById(tenantId, serverId);
}

/** 删除 MCP 服务器（可选级联删除关联工具） */
export function deleteMcpServer(
  tenantId: string = DEFAULT_TENANT_ID,
  serverId: string,
  removeTools: boolean = true,
): boolean {
  const db = initDb();
  if (removeTools) {
    db.prepare('DELETE FROM sd_tools WHERE mcp_server_id = ?').run(serverId);
  }
  const result = db
    .prepare('DELETE FROM sd_mcp_servers WHERE tenant_id = ? AND id = ?')
    .run(tenantId, serverId);
  return result.changes > 0;
}
