/**
 * API Templates Data Access Object — API 模板数据访问层
 *
 * v3.0: 封装 api_templates 表的所有 CRUD 操作
 * + 5 个内置模板的 seed 逻辑（在 db.ts 中执行）
 */

import { initDb, type ApiTemplateRow } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// ===================== Public DAO Functions =====================

/**
 * 分页查询 API 模板
 * 支持按 domain / method / risk_level / is_builtin 过滤 + 搜索
 */
export function listApiTemplates(params?: {
  domain?: string;
  method?: string;
  riskLevel?: string;
  isBuiltin?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}): { items: ApiTemplateRow[]; total: number } {
  const db = initDb();
  const conditions: string[] = [];
  const sqlParams: unknown[] = [];

  if (params?.domain) {
    conditions.push('domain = ?');
    sqlParams.push(params.domain);
  }
  if (params?.method) {
    conditions.push('method = ?');
    sqlParams.push(params.method);
  }
  if (params?.riskLevel) {
    conditions.push('risk_level = ?');
    sqlParams.push(params.riskLevel);
  }
  if (params?.isBuiltin !== undefined) {
    conditions.push('is_builtin = ?');
    sqlParams.push(params.isBuiltin ? 1 : 0);
  }
  if (params?.search && params.search.trim() !== '') {
    conditions.push('(name LIKE ? OR description LIKE ? OR id LIKE ?)');
    const like = `%${params.search.trim()}%`;
    sqlParams.push(like, like, like);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const page = Math.max(1, params?.page ?? 1);
  const pageSize = Math.min(Math.max(1, params?.pageSize ?? 50), 200);
  const offset = (page - 1) * pageSize;

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM api_templates ${whereClause}`).get(...sqlParams) as { cnt: number };
  const items = db.prepare(
    `SELECT * FROM api_templates ${whereClause} ORDER BY is_builtin DESC, updated_at DESC LIMIT ? OFFSET ?`
  ).all(...sqlParams, pageSize, offset) as ApiTemplateRow[];

  return { items, total: countRow.cnt };
}

/**
 * 根据 ID 获取单个 API 模板
 */
export function getApiTemplate(id: string): ApiTemplateRow | null {
  const db = initDb();
  return db.prepare('SELECT * FROM api_templates WHERE id = ?').get(id) as ApiTemplateRow | undefined ?? null;
}

/**
 * 创建新的 API 模板
 */
export function createApiTemplate(data: {
  name: string;
  description?: string;
  domain: string;
  method: string;
  pathTemplate: string;
  headersJson?: string;
  bodyTemplate?: string;
  responsePath?: string;
  responseExtractor?: string;
  riskLevel?: string;
  tags?: string[];
}): ApiTemplateRow {
  const db = initDb();
  const id = `user_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  const now = new Date().toISOString();

  // 验证 method
  const validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
  const method = validMethods.includes(data.method.toUpperCase()) ? data.method.toUpperCase() : 'GET';

  // 验证 risk_level
  const validRisks = ['auto', 'confirm', 'high-risk'];
  const riskLevel = validRisks.includes(data.riskLevel || '') ? data.riskLevel! : 'confirm';

  // 验证 response_extractor
  const validExtractors = ['none', 'jsonpath', 'css', 'regex'];
  const responseExtractor = validExtractors.includes(data.responseExtractor || '') ? data.responseExtractor! : 'none';

  db.prepare(
    `INSERT INTO api_templates (id, name, description, domain, method, path_template, headers_json, body_template, response_path, response_extractor, risk_level, is_builtin, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    id,
    data.name,
    data.description || '',
    data.domain,
    method,
    data.pathTemplate,
    data.headersJson || '{}',
    data.bodyTemplate || '',
    data.responsePath || '',
    responseExtractor,
    riskLevel,
    JSON.stringify(data.tags || []),
    now,
    now,
  );

  return db.prepare('SELECT * FROM api_templates WHERE id = ?').get(id) as ApiTemplateRow;
}

/**
 * 更新已有 API 模板（内置模板仅允许更新部分字段）
 */
export function updateApiTemplate(
  id: string,
  data: Partial<{
    name: string;
    description: string;
    domain: string;
    method: string;
    pathTemplate: string;
    headersJson: string;
    bodyTemplate: string;
    responsePath: string;
    responseExtractor: string;
    riskLevel: string;
    tags: string[];
  }>,
): ApiTemplateRow | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM api_templates WHERE id = ?').get(id) as ApiTemplateRow | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  const updates: string[] = ['updated_at = ?'];
  const params: unknown[] = [now];

  // 可更新字段映射 (DB column → data key)
  const fieldMap: Record<string, [string, string[]]> = {
    name: ['name', []],
    description: ['description', []],
    domain: ['domain', []],
    method: ['method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']],
    pathTemplate: ['path_template', []],
    headersJson: ['headers_json', []],
    bodyTemplate: ['body_template', []],
    responsePath: ['response_path', []],
    responseExtractor: ['response_extractor', ['none', 'jsonpath', 'css', 'regex']],
    riskLevel: ['risk_level', ['auto', 'confirm', 'high-risk']],
  };

  for (const [dataKey, [dbCol, validValues]] of Object.entries(fieldMap)) {
    if (dataKey in data) {
      const value = (data as Record<string, unknown>)[dataKey];
      if (typeof value === 'string') {
        const finalValue = validValues.length > 0 && !validValues.includes(value) ? existing[dbCol as keyof ApiTemplateRow] : value;
        updates.push(`${dbCol} = ?`);
        params.push(finalValue);
      }
    }
  }

  // tags 特殊处理
  if ('tags' in data && Array.isArray(data.tags)) {
    updates.push('tags = ?');
    params.push(JSON.stringify(data.tags));
  }

  params.push(id);
  db.prepare(`UPDATE api_templates SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return db.prepare('SELECT * FROM api_templates WHERE id = ?').get(id) as ApiTemplateRow;
}

/**
 * 删除 API 模板（内置模板不可删除）
 */
export function deleteApiTemplate(id: string): { success: boolean; error?: string } {
  const db = initDb();
  const existing = db.prepare('SELECT is_builtin FROM api_templates WHERE id = ?').get(id) as { is_builtin: number } | undefined;
  if (!existing) return { success: false, error: '模板不存在' };
  if (existing.is_builtin === 1) return { success: false, error: '内置模板不可删除' };

  const result = db.prepare('DELETE FROM api_templates WHERE id = ? AND is_builtin = 0').run(id);
  return { success: result.changes > 0 };
}

/**
 * 获取所有可用域名列表（供模板下拉选择用）
 */
export function getTemplateDomains(): string[] {
  const db = initDb();
  const rows = db.prepare('SELECT DISTINCT domain FROM api_templates WHERE domain != \'\' ORDER BY domain').all() as { domain: string }[];
  return rows.map(r => r.domain);
}

/**
 * 根据 ID 列表批量获取模板（供批量执行用）
 */
export function getApiTemplatesByIds(ids: string[]): ApiTemplateRow[] {
  if (ids.length === 0) return [];
  const db = initDb();
  const placeholders = ids.map(() => '?').join(',');
  return db.prepare(`SELECT * FROM api_templates WHERE id IN (${placeholders})`).all(...ids) as ApiTemplateRow[];
}
