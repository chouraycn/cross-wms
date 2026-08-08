/**
 * StaffDeck Memory DAO — sd_memories 表 CRUD
 */
import { initDb } from '../../db.js';
import { newStaffId, StaffIdPrefix, DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { MemoryRecordRow } from '../../types/staff.js';

// ===================== 查询 =====================

interface ListMemoriesFilter {
  user_id?: string;
  username?: string;
  kind?: string;
  exclude_kind?: string;
  q?: string;
  limit?: number;
}

/** 列出记忆记录（默认排除 conversation 类型，与 StaffDeck 行为一致） */
export function listMemories(
  tenantId: string = DEFAULT_TENANT_ID,
  filter: ListMemoriesFilter = {},
): MemoryRecordRow[] {
  const db = initDb();
  const conditions: string[] = ['tenant_id = ?'];
  const params: any[] = [tenantId];

  if (filter.user_id) {
    conditions.push('user_id = ?');
    params.push(filter.user_id);
  }
  if (filter.username) {
    conditions.push('username = ?');
    params.push(filter.username);
  }
  if (filter.kind) {
    conditions.push('kind = ?');
    params.push(filter.kind);
  }
  if (filter.exclude_kind) {
    conditions.push('kind != ?');
    params.push(filter.exclude_kind);
  }

  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  params.push(limit);

  let rows = db
    .prepare(
      `SELECT * FROM sd_memories WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC LIMIT ?`,
    )
    .all(...params) as MemoryRecordRow[];

  // 内存过滤：模糊搜索 content / username
  if (filter.q && filter.q.trim() !== '') {
    const needle = filter.q.trim().toLowerCase();
    rows = rows.filter(
      (row) =>
        row.content.toLowerCase().includes(needle) ||
        (row.username || '').toLowerCase().includes(needle),
    );
  }

  return rows;
}

// ===================== 写入 =====================

interface CreateMemoryData {
  tenant_id?: string;
  user_id: string;
  username?: string | null;
  session_id?: string | null;
  kind?: string;
  content: string;
  importance?: number;
  metadata?: Record<string, any>;
}

/** 创建记忆记录 */
export function createMemory(data: CreateMemoryData): MemoryRecordRow {
  const db = initDb();
  const id = newStaffId(StaffIdPrefix.memory);
  const tenantId = data.tenant_id || DEFAULT_TENANT_ID;
  db.prepare(
    `INSERT INTO sd_memories (
      id, tenant_id, user_id, username, session_id, kind, content, importance, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    tenantId,
    data.user_id,
    data.username ?? null,
    data.session_id ?? null,
    data.kind || 'conversation',
    data.content,
    data.importance ?? 0.5,
    JSON.stringify(data.metadata ?? {}),
  );
  return db.prepare('SELECT * FROM sd_memories WHERE id = ?').get(id) as MemoryRecordRow;
}

/** 清空指定用户的记忆（默认排除 conversation 类型），返回删除条数 */
export function clearMemoriesByUser(
  tenantId: string = DEFAULT_TENANT_ID,
  userId: string,
  excludeKind: string = 'conversation',
): number {
  const db = initDb();
  // 先查询出符合条件的记忆（供未来扩展过滤，如 agent_id 过滤）
  const rows = db
    .prepare(
      'SELECT id FROM sd_memories WHERE tenant_id = ? AND user_id = ? AND kind != ?',
    )
    .all(tenantId, userId, excludeKind) as Array<{ id: string }>;
  if (rows.length === 0) return 0;
  const ids = rows.map((r) => r.id);
  const placeholders = ids.map(() => '?').join(',');
  const result = db
    .prepare(`DELETE FROM sd_memories WHERE id IN (${placeholders})`)
    .run(...ids);
  return result.changes;
}
