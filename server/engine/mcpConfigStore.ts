/**
 * MCP Config Store
 *
 * v9.0: 改为使用 SQLiteEngine 封装独立数据库（mcp_servers.db）
 * - 保留独立数据库设计（MCP 配置是系统状态，适合 SQLite）
 * - 使用 SQLiteEngine 替代直接的 better-sqlite3 调用
 * - 兼容 mcpTypes.ts 中的 McpServerConfig 类型
 *
 * v10.0: 合并入主库 chat.db，使用 DatabaseManager 统一管理
 * - 不再使用独立 mcp_servers.db
 * - 通过 DatabaseManager.getMainDb() 获取主库连接
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { DatabaseManager } from '../storage/databaseManager.js';
import type { McpServerConfig, McpTransportType } from './mcpTypes.js';
import type { McpServerRow } from '../types/staff.js';

/** 数字员工默认租户 ID（与 db-staff.DEFAULT_TENANT_ID 保持一致，本地化以避免循环依赖） */
const DEFAULT_TENANT_ID = 'default';

// ===================== 数据库访问 =====================

function getDb() {
  return DatabaseManager.getMainDb();
}

// ===================== 建表迁移 =====================

function migrateOldColumnNames(): void {
  const db = getDb();
  try {
    const columns = db.pragma('table_info(mcp_servers)') as Array<{ name: string }>;
    const colNames = columns.map(c => c.name);
    
    const hasOldCamelCase = 
      colNames.includes('createdAt') || 
      colNames.includes('updatedAt') || 
      colNames.includes('transportType');
    
    const hasNewSnakeCase = 
      colNames.includes('created_at') || 
      colNames.includes('updated_at') || 
      colNames.includes('transport_type');
    
    if (!hasOldCamelCase || hasNewSnakeCase) return;
    
    logger.info('[MCPStore] 检测到旧列名（驼峰命名），开始迁移到下划线命名...');
    
    const hasTransportType = colNames.includes('transportType');
    const hasCreatedAt = colNames.includes('createdAt');
    const hasUpdatedAt = colNames.includes('updatedAt');
    
    const newTableCols = ['id', 'name', 'command', 'args', 'env', 'enabled', 'transport_type', 'created_at', 'updated_at'];
    const selectExprs: string[] = [
      'id', 'name', 'command', 'args', 'env', 'enabled',
    ];
    
    if (hasTransportType) {
      selectExprs.push('transportType AS transport_type');
    } else {
      selectExprs.push("'stdio' AS transport_type");
    }
    
    if (hasCreatedAt) {
      selectExprs.push('createdAt AS created_at');
    } else {
      selectExprs.push('0 AS created_at');
    }
    
    if (hasUpdatedAt) {
      selectExprs.push('updatedAt AS updated_at');
    } else {
      selectExprs.push('0 AS updated_at');
    }
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_servers_new (
        id          TEXT PRIMARY KEY,
        name        TEXT    NOT NULL,
        tenant_id   TEXT,
        command     TEXT    NOT NULL,
        args        TEXT,
        env         TEXT,
        enabled     INTEGER NOT NULL DEFAULT 1,
        transport_type TEXT NOT NULL DEFAULT 'stdio',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        UNIQUE(tenant_id, name)
      );
      
      INSERT INTO mcp_servers_new (${newTableCols.join(', ')})
      SELECT ${selectExprs.join(', ')}
      FROM mcp_servers;
      
      DROP TABLE mcp_servers;
      ALTER TABLE mcp_servers_new RENAME TO mcp_servers;
    `);
    
    logger.info('[MCPStore] 列名迁移完成');
  } catch (e) {
    logger.error('[MCPStore] 列名迁移失败:', e);
  }
}

/**
 * 数字员工合并：将 mcp_servers 的「全局 name 唯一」改为「租户隔离 + 全局行局部唯一」。
 *
 * 原核心表为 name TEXT NOT NULL UNIQUE（全局唯一），而数字员工原 sd_mcp_servers 为
 * UNIQUE(tenant_id, name)（允许同一 name 跨租户复用）。合并后需保留该语义：
 *   - 租户行 (tenant_id = X)：(tenant_id, name) 唯一
 *   - 全局行 (tenant_id IS NULL)：name 唯一（SQLite 中 NULL 互不相等，复合唯一无法约束，
 *     故用 partial unique index 额外保证）
 *
 * SQLite 不支持 DROP CONSTRAINT，因此对已存在的全局唯一表通过重建表实现迁移。
 */
function migrateToTenantScopedUniqueness(): void {
  const db = getDb();

  let indexes: Array<{ name: string; unique: number }> = [];
  try {
    indexes = db.pragma('index_list(mcp_servers)') as Array<{ name: string; unique: number }>;
  } catch {
    return; // 表不存在，交由 initSchema 建表
  }

  const hasComposite = indexes.some((idx) => {
    if (!idx.unique) return false;
    const info = db.pragma(`index_info(${idx.name})`) as Array<{ name: string }>;
    const cols = info.map((c) => c.name);
    return cols.length === 2 && cols.includes('tenant_id') && cols.includes('name');
  });
  if (hasComposite) return; // 已迁移，跳过

  const hasGlobalNameUnique = indexes.some((idx) => {
    if (!idx.unique) return false;
    const info = db.pragma(`index_info(${idx.name})`) as Array<{ name: string }>;
    const cols = info.map((c) => c.name);
    return cols.length === 1 && cols[0] === 'name';
  });

  if (!hasGlobalNameUnique) {
    // 极旧表没有 name 唯一约束：直接补建索引
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_tenant_name ON mcp_servers(tenant_id, name)`);
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_global_name ON mcp_servers(name) WHERE tenant_id IS NULL`);
    return;
  }

  // 存在全局 name 唯一索引 → 重建表为租户隔离唯一
  try {
    const colsInfo = db.pragma('table_info(mcp_servers)') as Array<{
      name: string; type: string; notnull: number; dflt_value: string | null; pk: number;
    }>;
    const colDefs = colsInfo.map((c) => {
      let def = `"${c.name}" ${c.type || 'TEXT'}`;
      if (c.pk) def += ' PRIMARY KEY';
      else if (c.notnull) def += ' NOT NULL';
      if (c.dflt_value !== null && c.dflt_value !== undefined) def += ` DEFAULT ${c.dflt_value}`;
      return def;
    });
    colDefs.push('UNIQUE(tenant_id, name)');
    const colList = colsInfo.map((c) => `"${c.name}"`).join(', ');

    db.exec(`
      CREATE TABLE mcp_servers_new (
        ${colDefs.join(',\n        ')}
      );
      INSERT INTO mcp_servers_new (${colList}) SELECT ${colList} FROM mcp_servers;
      DROP TABLE mcp_servers;
      ALTER TABLE mcp_servers_new RENAME TO mcp_servers;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_global_name ON mcp_servers(name) WHERE tenant_id IS NULL;
    `);
    logger.info('[MCPStore] mcp_servers 已迁移为租户隔离唯一约束');
  } catch (e) {
    logger.error('[MCPStore] 重建 mcp_servers 失败:', e);
  }
}

function initSchema(): void {
  const db = getDb();

  // 先尝试迁移旧列名
  try {
    migrateOldColumnNames();
  } catch (e) {
    logger.warn('[MCPStore] 迁移旧列名跳过:', e);
  }

  // 数字员工合并：将全局 name 唯一约束迁移为租户隔离唯一
  try {
    migrateToTenantScopedUniqueness();
  } catch (e) {
    logger.warn('[MCPStore] 迁移租户隔离唯一约束跳过:', e);
  }

  // 建表（IF NOT EXISTS 保证幂等）
  db.exec(`
    CREATE TABLE IF NOT EXISTS mcp_servers (
      id          TEXT PRIMARY KEY,
      name        TEXT    NOT NULL,
      tenant_id   TEXT,
      command     TEXT    NOT NULL,
      args        TEXT,               -- JSON array
      env         TEXT,               -- JSON object
      enabled     INTEGER NOT NULL DEFAULT 1,
      transport_type TEXT NOT NULL DEFAULT 'stdio',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL,
      UNIQUE(tenant_id, name)
    );

    CREATE TABLE IF NOT EXISTS mcp_server_tools (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id   TEXT    NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
      name        TEXT    NOT NULL,
      description TEXT,
      input_schema TEXT,              -- JSON schema
      UNIQUE(server_id, name)
    );
  `);

  // 增量列迁移：为 sse / http 传输添加 url 和 headers 列
  try {
    const cols = db.pragma('table_info(mcp_servers)') as Array<{ name: string }>;
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('url')) {
      db.exec(`ALTER TABLE mcp_servers ADD COLUMN url TEXT`);
    }
    if (!colNames.includes('headers')) {
      db.exec(`ALTER TABLE mcp_servers ADD COLUMN headers TEXT`); // JSON object
    }
    // 数字员工合并：新增租户隔离与展示字段列（幂等）
    const extraCols: Array<[string, string]> = [
      ['tenant_id', 'TEXT'],
      ['display_name', 'TEXT'],
      ['description', 'TEXT'],
      ['bucket', 'TEXT'],
      ['cwd', 'TEXT'],
      ['discovered_tools', 'TEXT'],
      ['last_synced_at', 'INTEGER'],
    ];
    for (const [col, typ] of extraCols) {
      if (!colNames.includes(col)) {
        db.exec(`ALTER TABLE mcp_servers ADD COLUMN ${col} ${typ}`);
      }
    }
  } catch (e) {
    logger.warn('[MCPStore] 添加增量列失败（可能已存在）:', e);
  }

  // 版本标记
  db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('mcp_schema_version', ?)`).run('1.1.0');

  // 全局行（tenant_id IS NULL）name 唯一：partial unique index 保证（复合唯一无法约束 NULL 行）
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_mcp_servers_global_name ON mcp_servers(name) WHERE tenant_id IS NULL`);
}

// 延迟执行建表，但保证同步调用者可用（E2E 测试在同 tick 插入行时 schema 尚未就绪 → UNIQUE(name) 旧遗留）
let schemaInitialized = false;
function ensureSchemaReady(): void {
  if (schemaInitialized) return;
  try {
    initSchema();
  } catch (err) {
    logger.error('[MCPStore] 初始化 schema 失败:', err);
  } finally {
    schemaInitialized = true;
  }
}
setTimeout(() => { ensureSchemaReady(); }, 0);
export { ensureSchemaReady };

// ===================== 序列化/反序列化 =====================

function rowToConfig(row: Record<string, any>): McpServerConfig {
  const envRaw = row.env as string;
  let env: Record<string, string> = {};
  if (envRaw) {
    try {
      env = JSON.parse(envRaw);
    } catch {
      try {
        const decoded = Buffer.from(envRaw, 'base64').toString('utf8');
        env = JSON.parse(decoded);
      } catch {
        env = {};
      }
    }
  }

  const argsRaw = row.args as string;
  let args: string[] = [];
  if (argsRaw) {
    try {
      args = JSON.parse(argsRaw);
    } catch {
      try {
        const decoded = Buffer.from(argsRaw, 'base64').toString('utf8');
        args = JSON.parse(decoded);
      } catch {
        args = [];
      }
    }
  }

  const headersRaw = row.headers as string | undefined;
  let headers: Record<string, string> | undefined;
  if (headersRaw) {
    try {
      headers = JSON.parse(headersRaw);
    } catch {
      headers = undefined;
    }
  }

  return {
    id: row.id as string,
    name: row.name as string,
    command: row.command as string,
    args,
    env,
    enabled: Boolean(row.enabled),
    transportType: ((row.transport_type || row.transportType) as McpTransportType) || 'stdio',
    url: (row.url as string | undefined) || undefined,
    headers,
    createdAt: (row.created_at || row.createdAt) as number,
    updatedAt: (row.updated_at || row.updatedAt) as number,
  };
}

function configToRow(config: Partial<McpServerConfig>): Record<string, any> {
  const row: Record<string, any> = {};
  if (config.name !== undefined) row.name = config.name;
  if (config.command !== undefined) row.command = config.command;
  if (config.args !== undefined) row.args = JSON.stringify(config.args);
  if (config.env !== undefined) row.env = JSON.stringify(config.env);
  if (config.enabled !== undefined) row.enabled = config.enabled ? 1 : 0;
  if (config.transportType !== undefined) row.transport_type = config.transportType;
  if (config.url !== undefined) row.url = config.url;
  if (config.headers !== undefined) row.headers = JSON.stringify(config.headers);
  if (config.createdAt !== undefined) row.created_at = config.createdAt;
  if (config.updatedAt !== undefined) row.updated_at = config.updatedAt;
  return row;
}

// ===================== 服务器 CRUD =====================

/** 添加 Server（兼容旧 API） */
export function addServer(config: Omit<McpServerConfig, 'id' | 'createdAt' | 'updatedAt'>): McpServerConfig {
  const db = getDb();
  const now = Date.now();
  const id = uuidv4();
  const transportType = config.transportType || 'stdio';
  // command 列为 NOT NULL；sse/http 无命令时存空串占位
  const command = config.command || '';

  db.prepare(
    `INSERT INTO mcp_servers (id, name, command, args, env, enabled, transport_type, url, headers, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    config.name,
    command,
    JSON.stringify(config.args || []),
    JSON.stringify(config.env || {}),
    config.enabled !== false ? 1 : 0,
    transportType,
    config.url || null,
    config.headers ? JSON.stringify(config.headers) : null,
    now,
    now,
  );

  return {
    id,
    name: config.name,
    command,
    args: config.args || [],
    env: config.env || {},
    enabled: config.enabled !== false,
    transportType,
    url: config.url,
    headers: config.headers,
    createdAt: now,
    updatedAt: now,
  };
}

/** 获取 Server（兼容旧 API，按 ID 或 name，仅全局租户） */
export function getServer(idOrName: string): McpServerConfig | undefined {
  const db = getDb();

  // 先尝试按 ID 查询（仅全局租户，避免命中数字员工租户 server）
  let row = db.prepare('SELECT * FROM mcp_servers WHERE id = ? AND tenant_id IS NULL').get(idOrName) as Record<string, any> | undefined;

  // 再尝试按 name 查询（仅全局租户）
  if (!row) {
    row = db.prepare('SELECT * FROM mcp_servers WHERE name = ? AND tenant_id IS NULL').get(idOrName) as Record<string, any> | undefined;
  }

  return row ? rowToConfig(row) : undefined;
}

/** 更新 Server */
export function updateServer(id: string, updates: Partial<Omit<McpServerConfig, 'id' | 'createdAt'>>): McpServerConfig | undefined {
  const db = getDb();

  const sets: string[] = [];
  const params: any[] = [];

  if (updates.name !== undefined) {
    sets.push('name = ?');
    params.push(updates.name);
  }
  if (updates.command !== undefined) {
    sets.push('command = ?');
    params.push(updates.command);
  }
  if (updates.args !== undefined) {
    sets.push('args = ?');
    params.push(JSON.stringify(updates.args));
  }
  if (updates.env !== undefined) {
    sets.push('env = ?');
    params.push(JSON.stringify(updates.env));
  }
  if (updates.enabled !== undefined) {
    sets.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }
  if (updates.transportType !== undefined) {
    sets.push('transport_type = ?');
    params.push(updates.transportType);
  }
  if (updates.url !== undefined) {
    sets.push('url = ?');
    params.push(updates.url);
  }
  if (updates.headers !== undefined) {
    sets.push('headers = ?');
    params.push(JSON.stringify(updates.headers));
  }

  if (sets.length === 0) return getServer(id);

  const now = Date.now();
  sets.push('updated_at = ?');
  params.push(now);
  params.push(id);

  const result = db.prepare(
    `UPDATE mcp_servers SET ${sets.join(', ')} WHERE id = ?`
  ).run(...params);

  if (result.changes === 0) return undefined;

  return getServer(id);
}

/** 删除 Server */
export function deleteServer(id: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * 列出 Server。
 * @param enabledOnly 仅返回启用项
 * @param tenantId 租户过滤；为 null（默认）时仅返回全局租户（tenant_id IS NULL）的 server，
 *                 确保数字员工的租户 server 不会污染主程序全局 McpClientManager 单例。
 */
export function listServers(enabledOnly: boolean = false, tenantId: string | null = null): McpServerConfig[] {
  const db = getDb();
  const where = tenantId === null ? 'tenant_id IS NULL' : 'tenant_id = ?';
  const params: any[] = tenantId === null ? [] : [tenantId];

  let rows: Record<string, any>[];
  if (enabledOnly) {
    rows = db.prepare(`SELECT * FROM mcp_servers WHERE ${where} AND enabled = 1 ORDER BY created_at DESC`).all(...params) as Record<string, any>[];
  } else {
    rows = db.prepare(`SELECT * FROM mcp_servers WHERE ${where} ORDER BY created_at DESC`).all(...params) as Record<string, any>[];
  }
  return rows.map(rowToConfig);
}

// ===================== 工具 CRUD =====================

export function listTools(serverId?: string): Array<{
  id: number;
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}> {
  const db = getDb();
  if (serverId !== undefined) {
    const rows = db.prepare('SELECT * FROM mcp_server_tools WHERE server_id = ? ORDER BY name').all(serverId) as Record<string, any>[];
    return rows.map((row) => ({
      id: row.id as number,
      serverId: row.server_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      inputSchema: row.input_schema ? JSON.parse(row.input_schema as string) : undefined,
    }));
  }
  const rows = db.prepare('SELECT * FROM mcp_server_tools ORDER BY name').all() as Record<string, any>[];
  return rows.map((row) => ({
    id: row.id as number,
    serverId: row.server_id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    inputSchema: row.input_schema ? JSON.parse(row.input_schema as string) : undefined,
  }));
}

export function createTool(config: {
  serverId: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO mcp_server_tools (server_id, name, description, input_schema)
     VALUES (?, ?, ?, ?)`
  ).run(
    config.serverId,
    config.name,
    config.description ?? null,
    config.inputSchema ? JSON.stringify(config.inputSchema) : null,
  );
  return Number(result.lastInsertRowid);
}

export function deleteTool(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM mcp_server_tools WHERE id = ?').run(id);
  return result.changes > 0;
}

// ===================== 数字员工（租户隔离）MCP 存储 =====================
//
// 数字员工的 MCP server 配置已并入核心 mcp_servers 表（通过 tenant_id 区分），
// 不再是独立的 sd_mcp_servers 表。以下函数供数字员工链路
// （staffMcpClientManager / routes/staff/mcpServers / routes/staff/tools 等）使用，
// 返回与历史 sd_mcp_servers 完全一致的 McpServerRow（transport / *_json 约定保持不变），
// 以最小化调用方改动。

/** 将核心 mcp_servers 行映射为数字员工历史 McpServerRow（时间由毫秒转秒以贴合 API 契约） */
function rowToMcpServerRow(row: Record<string, any>): McpServerRow {
  return {
    id: row.id as string,
    tenant_id: (row.tenant_id as string) ?? DEFAULT_TENANT_ID,
    name: row.name as string,
    display_name: (row.display_name as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    bucket: (row.bucket as string) || 'MCP 工具',
    transport: (row.transport_type as string) || 'streamable_http',
    url: (row.url as string | null) ?? null,
    headers_json: (row.headers as string | null) ?? '{}',
    command: (row.command as string | null) ?? null,
    args_json: (row.args as string | null) ?? '[]',
    env_json: (row.env as string | null) ?? '{}',
    cwd: (row.cwd as string | null) ?? null,
    discovered_tools_json: (row.discovered_tools as string | null) ?? '[]',
    last_synced_at: (row.last_synced_at as number | null) ?? null,
    enabled: ((row.enabled as number) === 1 ? 1 : 0) as 0 | 1,
    created_at: Math.floor(((row.created_at as number) || 0) / 1000),
    updated_at: Math.floor(((row.updated_at as number) || 0) / 1000),
  };
}

/** 列出某租户下的全部 MCP 服务器 */
export function listMcpServers(tenantId: string = DEFAULT_TENANT_ID): McpServerRow[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM mcp_servers WHERE tenant_id = ? ORDER BY name ASC')
    .all(tenantId) as Record<string, any>[];
  return rows.map(rowToMcpServerRow);
}

/** 按 ID 获取单个 MCP 服务器 */
export function getMcpServerById(
  tenantId: string = DEFAULT_TENANT_ID,
  serverId: string,
): McpServerRow | undefined {
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM mcp_servers WHERE tenant_id = ? AND id = ?')
    .get(tenantId, serverId) as Record<string, any> | undefined;
  return row ? rowToMcpServerRow(row) : undefined;
}

interface CreateMcpServerData {
  tenant_id?: string;
  name: string;
  display_name?: string | null;
  description?: string | null;
  bucket?: string;
  transport?: string;
  url?: string | null;
  headers?: Record<string, any>;
  command?: string | null;
  args?: string[];
  env?: Record<string, any>;
  cwd?: string | null;
  enabled?: boolean;
}

/** 创建 MCP 服务器（数字员工租户） */
export function createMcpServer(data: CreateMcpServerData): McpServerRow {
  ensureSchemaReady();
  const db = getDb();
  const id = uuidv4();
  const tenantId = data.tenant_id || DEFAULT_TENANT_ID;
  const bucket = (data.bucket || '').trim() || 'MCP 工具';
  const now = Date.now();
  db.prepare(
    `INSERT INTO mcp_servers (
      id, tenant_id, name, command, args, env, enabled, transport_type, url, headers,
      created_at, updated_at, display_name, description, bucket, cwd, discovered_tools
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    data.name,
    data.command ?? '',
    JSON.stringify(data.args ?? []),
    JSON.stringify(data.env ?? {}),
    data.enabled === false ? 0 : 1,
    data.transport || 'streamable_http',
    data.url ?? null,
    JSON.stringify(data.headers ?? {}),
    now,
    now,
    data.display_name ?? null,
    data.description ?? null,
    bucket,
    data.cwd ?? null,
    '[]',
  );
  return getMcpServerById(tenantId, id)!;
}

interface UpdateMcpServerData {
  name?: string;
  display_name?: string | null;
  description?: string | null;
  bucket?: string;
  transport?: string;
  url?: string | null;
  headers?: Record<string, any>;
  command?: string | null;
  args?: string[];
  env?: Record<string, any>;
  cwd?: string | null;
  discovered_tools?: any[];
  last_synced_at?: number | null;
  enabled?: boolean;
}

/** 更新 MCP 服务器（部分更新，数字员工租户） */
export function updateMcpServer(
  tenantId: string = DEFAULT_TENANT_ID,
  serverId: string,
  updates: UpdateMcpServerData,
): McpServerRow | undefined {
  const db = getDb();
  const existing = getMcpServerById(tenantId, serverId);
  if (!existing) return undefined;

  const setClauses: string[] = ['updated_at = ?'];
  const params: any[] = [Date.now()];

  if (updates.name !== undefined) {
    setClauses.push('name = ?');
    params.push(updates.name);
  }
  if (updates.display_name !== undefined) {
    setClauses.push('display_name = ?');
    params.push(updates.display_name ?? null);
  }
  if (updates.description !== undefined) {
    setClauses.push('description = ?');
    params.push(updates.description ?? null);
  }
  if (updates.bucket !== undefined) {
    setClauses.push('bucket = ?');
    params.push((updates.bucket || '').trim() || 'MCP 工具');
  }
  if (updates.transport !== undefined) {
    setClauses.push('transport_type = ?');
    params.push(updates.transport);
  }
  if (updates.url !== undefined) {
    setClauses.push('url = ?');
    params.push(updates.url ?? null);
  }
  if (updates.headers !== undefined) {
    setClauses.push('headers = ?');
    params.push(JSON.stringify(updates.headers));
  }
  if (updates.command !== undefined) {
    setClauses.push('command = ?');
    params.push(updates.command ?? '');
  }
  if (updates.args !== undefined) {
    setClauses.push('args = ?');
    params.push(JSON.stringify(updates.args));
  }
  if (updates.env !== undefined) {
    setClauses.push('env = ?');
    params.push(JSON.stringify(updates.env));
  }
  if (updates.cwd !== undefined) {
    setClauses.push('cwd = ?');
    params.push(updates.cwd ?? null);
  }
  if (updates.discovered_tools !== undefined) {
    setClauses.push('discovered_tools = ?');
    params.push(JSON.stringify(updates.discovered_tools));
  }
  if (updates.last_synced_at !== undefined) {
    setClauses.push('last_synced_at = ?');
    params.push(updates.last_synced_at ?? null);
  }
  if (updates.enabled !== undefined) {
    setClauses.push('enabled = ?');
    params.push(updates.enabled ? 1 : 0);
  }

  params.push(tenantId, serverId);
  db.prepare(`UPDATE mcp_servers SET ${setClauses.join(', ')} WHERE tenant_id = ? AND id = ?`).run(...params);
  return getMcpServerById(tenantId, serverId);
}

/** 删除 MCP 服务器（数字员工租户，可选级联删除关联工具） */
export function deleteMcpServer(
  tenantId: string = DEFAULT_TENANT_ID,
  serverId: string,
  removeTools: boolean = true,
): boolean {
  const db = getDb();
  if (removeTools) {
    db.prepare('DELETE FROM sd_tools WHERE mcp_server_id = ?').run(serverId);
  }
  const result = db.prepare('DELETE FROM mcp_servers WHERE tenant_id = ? AND id = ?').run(tenantId, serverId);
  return result.changes > 0;
}
