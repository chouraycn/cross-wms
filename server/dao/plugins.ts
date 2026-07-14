/**
 * Plugin Data Access Object — 插件数据访问层
 *
 * v3.0: 封装 plugins 表的所有 CRUD 操作。
 * 所有函数均使用 better-sqlite3 同步 API。
 */

import { initDb, type PluginRow, type PluginDependencyRow } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// ===================== Public DAO Functions =====================

/**
 * 分页查询插件列表，支持按状态筛选和名称模糊搜索。
 */
export function listPlugins(
  status?: string,
  search?: string,
  page: number = 1,
  pageSize: number = 20
): { items: PluginRow[]; total: number } {
  const db = initDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }
  if (search && search.trim() !== '') {
    conditions.push('(name LIKE ? OR display_name LIKE ?)');
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM plugins ${whereClause}`).get(...params) as { cnt: number };
  const total = countRow.cnt;

  const offset = (page - 1) * pageSize;
  const items = db.prepare(
    `SELECT * FROM plugins ${whereClause} ORDER BY installed_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as PluginRow[];

  return { items, total };
}

/** 按 ID 获取单个插件 */
export function getPlugin(id: string): PluginRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM plugins WHERE id = ?').get(id) as PluginRow | undefined;
}

/** 按名称获取插件 */
export function getPluginByName(name: string): PluginRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM plugins WHERE name = ?').get(name) as PluginRow | undefined;
}

/** 获取所有已启用的插件（供 tool registry 动态注入用） */
export function listEnabledPlugins(): PluginRow[] {
  const db = initDb();
  return db.prepare('SELECT * FROM plugins WHERE status = ? ORDER BY name ASC').all('enabled') as PluginRow[];
}

/** 创建插件记录 */
export function createPlugin(data: {
  name: string;
  display_name?: string;
  version?: string;
  author?: string;
  description?: string;
  icon?: string;
  manifest_json?: string;
  entry_path?: string;
  install_path?: string;
  trigger_keywords?: string;
  permissions?: string;
  risk_level?: string;
  size_bytes?: number;
  metadata?: string;
}): PluginRow {
  const db = initDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO plugins (id, name, display_name, version, author, description, icon, manifest_json,
      entry_path, install_path, trigger_keywords, permissions, risk_level, size_bytes, metadata,
      installed_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.display_name || data.name,
    data.version || '1.0.0',
    data.author || '',
    data.description || '',
    data.icon || 'Extension',
    data.manifest_json || '{}',
    data.entry_path || 'index.js',
    data.install_path || '',
    data.trigger_keywords || '[]',
    data.permissions || '[]',
    data.risk_level || 'auto',
    data.size_bytes || 0,
    data.metadata || '{}',
    now,
    now
  );
  return getPlugin(id)!;
}

/** 更新插件记录 */
export function updatePlugin(
  id: string,
  updates: Partial<Pick<PluginRow, 'display_name' | 'status' | 'trigger_keywords' | 'permissions' | 'risk_level' | 'metadata'>>
): PluginRow | undefined {
  const db = initDb();
  const existing = getPlugin(id);
  if (!existing) return undefined;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (updates.display_name !== undefined) { sets.push('display_name = ?'); params.push(updates.display_name); }
  if (updates.status !== undefined) { sets.push('status = ?'); params.push(updates.status); }
  if (updates.trigger_keywords !== undefined) { sets.push('trigger_keywords = ?'); params.push(updates.trigger_keywords); }
  if (updates.permissions !== undefined) { sets.push('permissions = ?'); params.push(updates.permissions); }
  if (updates.risk_level !== undefined) { sets.push('risk_level = ?'); params.push(updates.risk_level); }
  if (updates.metadata !== undefined) { sets.push('metadata = ?'); params.push(updates.metadata); }

  if (sets.length === 0) return existing;

  sets.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare(`UPDATE plugins SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getPlugin(id);
}

/** 删除插件记录 */
export function deletePlugin(id: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM plugins WHERE id = ?').run(id);
  return result.changes > 0;
}

/** 更新插件状态（enable/disable） */
export function setPluginStatus(id: string, status: string): PluginRow | undefined {
  return updatePlugin(id, { status });
}

/** 获取插件配置（从 metadata 中解析） */
export function getPluginConfig(id: string): Record<string, unknown> {
  const plugin = getPlugin(id);
  if (!plugin) return {};
  try {
    const metadata = JSON.parse(plugin.metadata || '{}');
    return metadata.config || {};
  } catch {
    return {};
  }
}

/** 更新插件配置（保存到 metadata 中） */
export function setPluginConfig(id: string, config: Record<string, unknown>): PluginRow | undefined {
  const plugin = getPlugin(id);
  if (!plugin) return undefined;
  try {
    const metadata = JSON.parse(plugin.metadata || '{}');
    metadata.config = config;
    return updatePlugin(id, { metadata: JSON.stringify(metadata) });
  } catch {
    const metadata = { config };
    return updatePlugin(id, { metadata: JSON.stringify(metadata) });
  }
}

// ===================== v4.1: Enhanced Plugin DAO =====================

/**
 * 获取插件配置（从 config_json 列读取）
 */
export function getPluginConfigJson(id: string): Record<string, unknown> {
  const plugin = getPlugin(id);
  if (!plugin) return {};
  try {
    return JSON.parse(plugin.config_json || '{}');
  } catch {
    return {};
  }
}

/**
 * 更新插件配置（写入 config_json 列）
 */
export function setPluginConfigJson(id: string, config: Record<string, unknown>): PluginRow | undefined {
  const db = initDb();
  const existing = getPlugin(id);
  if (!existing) return undefined;
  
  db.prepare(`UPDATE plugins SET config_json = ?, updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(config), new Date().toISOString(), id);
  
  return getPlugin(id);
}

/**
 * 更新插件激活时间
 */
export function updatePluginActivatedAt(id: string, activatedAt: string | null): PluginRow | undefined {
  const db = initDb();
  const existing = getPlugin(id);
  if (!existing) return undefined;
  
  db.prepare(`UPDATE plugins SET activated_at = ?, updated_at = ? WHERE id = ?`)
    .run(activatedAt, new Date().toISOString(), id);
  
  return getPlugin(id);
}

/**
 * 更新插件最后错误信息
 */
export function updatePluginLastError(id: string, lastError: string | null): PluginRow | undefined {
  const db = initDb();
  const existing = getPlugin(id);
  if (!existing) return undefined;
  
  db.prepare(`UPDATE plugins SET last_error = ?, updated_at = ? WHERE id = ?`)
    .run(lastError, new Date().toISOString(), id);
  
  return getPlugin(id);
}

// ===================== Plugin Dependencies DAO =====================

/**
 * 获取插件的所有依赖
 */
export function getPluginDependencies(pluginId: string): PluginDependencyRow[] {
  const db = initDb();
  return db.prepare(
    'SELECT * FROM plugin_dependencies WHERE plugin_id = ? ORDER BY created_at ASC'
  ).all(pluginId) as PluginDependencyRow[];
}

/**
 * 添加插件依赖
 */
export function addPluginDependency(
  pluginId: string,
  dependencyName: string,
  dependencyVersion?: string,
  isOptional: boolean = false
): PluginDependencyRow {
  const db = initDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO plugin_dependencies (id, plugin_id, dependency_name, dependency_version, is_optional, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, pluginId, dependencyName, dependencyVersion || null, isOptional ? 1 : 0, now);
  
  return db.prepare('SELECT * FROM plugin_dependencies WHERE id = ?').get(id) as PluginDependencyRow;
}

/**
 * 批量设置插件依赖（先删除后添加）
 */
export function setPluginDependencies(
  pluginId: string,
  dependencies: Array<{ name: string; version?: string; optional?: boolean }>
): void {
  const db = initDb();
  const now = new Date().toISOString();
  
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM plugin_dependencies WHERE plugin_id = ?').run(pluginId);
    
    const insert = db.prepare(`
      INSERT INTO plugin_dependencies (id, plugin_id, dependency_name, dependency_version, is_optional, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    for (const dep of dependencies) {
      insert.run(
        uuidv4(),
        pluginId,
        dep.name,
        dep.version || null,
        dep.optional ? 1 : 0,
        now
      );
    }
  });
  
  tx();
}

/**
 * 删除插件依赖
 */
export function removePluginDependency(dependencyId: string): boolean {
  const db = initDb();
  const result = db.prepare('DELETE FROM plugin_dependencies WHERE id = ?').run(dependencyId);
  return result.changes > 0;
}

/**
 * 获取依赖于指定插件的所有插件
 */
export function getPluginDependents(dependencyName: string): PluginRow[] {
  const db = initDb();
  return db.prepare(`
    SELECT p.* FROM plugins p
    INNER JOIN plugin_dependencies pd ON p.id = pd.plugin_id
    WHERE pd.dependency_name = ?
    ORDER BY p.name ASC
  `).all(dependencyName) as PluginRow[];
}
