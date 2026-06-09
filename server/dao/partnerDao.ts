/**
 * Partner Data Access Object — 客商数据访问层
 *
 * 封装 partners 表的所有 CRUD 操作，包括引用检查和快速创建。
 * 所有函数均使用 better-sqlite3 同步 API。
 */
import { initDb, type PartnerRow } from '../db.js';
import { v4 as uuidv4 } from 'uuid';

// ===================== Public DAO Functions =====================

/**
 * 分页查询客商列表，支持按类型筛选和名称模糊搜索。
 *
 * @param type - 可选，按 'supplier' 或 'customer' 筛选
 * @param search - 可选，按名称模糊匹配 (LIKE)
 * @param page - 页码，从 1 开始，默认 1
 * @param pageSize - 每页条数，默认 20
 * @returns items 数组和 total 总数
 */
export function listPartners(
  type?: 'supplier' | 'customer',
  search?: string,
  page: number = 1,
  pageSize: number = 20
): { items: PartnerRow[]; total: number } {
  const db = initDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (type) {
    conditions.push('type = ?');
    params.push(type);
  }
  if (search && search.trim() !== '') {
    conditions.push('name LIKE ?');
    params.push(`%${search.trim()}%`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Count total
  const countRow = db.prepare(
    `SELECT COUNT(*) as cnt FROM partners ${whereClause}`
  ).get(...params) as { cnt: number };
  const total = countRow.cnt;

  // Paginated select
  const offset = (page - 1) * pageSize;
  const items = db.prepare(
    `SELECT * FROM partners ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, pageSize, offset) as PartnerRow[];

  return { items, total };
}

/**
 * 获取全部客商（供 Autocomplete 下拉选项使用）。
 * 仅返回 id、name、type 三个字段，数据量小，适合全量加载。
 *
 * @param type - 可选，按 'supplier' 或 'customer' 筛选
 * @returns 简化对象数组 [{ id, name, type }]
 */
export function getAllPartnersByType(
  type?: 'supplier' | 'customer'
): Array<{ id: string; name: string; type: string }> {
  const db = initDb();
  let sql = 'SELECT id, name, type FROM partners';
  const params: unknown[] = [];
  if (type) {
    sql += ' WHERE type = ?';
    params.push(type);
  }
  sql += ' ORDER BY name ASC';
  return db.prepare(sql).all(...params) as Array<{ id: string; name: string; type: string }>;
}

/**
 * 根据 ID 获取单个客商详情。
 *
 * @param id - 客商 ID (uuid)
 * @returns PartnerRow 或 undefined
 */
export function getPartnerById(id: string): PartnerRow | undefined {
  const db = initDb();
  return db.prepare('SELECT * FROM partners WHERE id = ?').get(id) as PartnerRow | undefined;
}

/**
 * 创建新客商。
 *
 * @param data - 客商数据（不含 id、created_at、updated_at，由 DAO 生成）
 * @returns 新创建的 PartnerRow（含自动生成的 id 和时间戳）
 */
export function createPartner(
  data: Omit<PartnerRow, 'id' | 'created_at' | 'updated_at'>
): PartnerRow {
  const db = initDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO partners (id, name, type, contact, phone, address, remark, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.name,
    data.type,
    data.contact ?? '',
    data.phone ?? '',
    data.address ?? '',
    data.remark ?? '',
    now,
    now
  );
  return db.prepare('SELECT * FROM partners WHERE id = ?').get(id) as PartnerRow;
}

/**
 * 更新已有客商。
 *
 * @param id - 客商 ID
 * @param data - 要更新的字段（可部分更新）
 * @returns 更新后的 PartnerRow，不存在时返回 null
 */
export function updatePartner(
  id: string,
  data: Partial<Omit<PartnerRow, 'id' | 'created_at' | 'updated_at'>>
): PartnerRow | null {
  const db = initDb();
  const existing = db.prepare('SELECT * FROM partners WHERE id = ?').get(id) as PartnerRow | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated = {
    name: data.name !== undefined ? data.name : existing.name,
    type: data.type !== undefined ? data.type : existing.type,
    contact: data.contact !== undefined ? data.contact : existing.contact,
    phone: data.phone !== undefined ? data.phone : existing.phone,
    address: data.address !== undefined ? data.address : existing.address,
    remark: data.remark !== undefined ? data.remark : existing.remark,
  };

  db.prepare(
    `UPDATE partners
     SET name = ?, type = ?, contact = ?, phone = ?, address = ?, remark = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    updated.name,
    updated.type,
    updated.contact,
    updated.phone,
    updated.address,
    updated.remark,
    now,
    id
  );

  return db.prepare('SELECT * FROM partners WHERE id = ?').get(id) as PartnerRow;
}

/**
 * 删除客商（应用层引用保护）。
 *
 * 删除前检查 inbound_records（supplier_id）和 outbound_records（customer_id）
 * 是否有引用。有引用时拒绝删除，无引用时正常删除。
 *
 * @param id - 客商 ID
 * @returns 结果对象，success 表示是否删除成功，失败时包含 referenceCount 和 message
 */
export function deletePartner(id: string): {
  success: boolean;
  referenceCount?: number;
  message?: string;
} {
  const db = initDb();
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(id) as PartnerRow | undefined;
  if (!partner) {
    return { success: false, message: '客商不存在' };
  }

  let refCount = 0;
  if (partner.type === 'supplier') {
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM inbound_records WHERE supplier_id = ?'
    ).get(id) as { cnt: number };
    refCount = row.cnt;
  }
  if (partner.type === 'customer') {
    const row = db.prepare(
      'SELECT COUNT(*) as cnt FROM outbound_records WHERE customer_id = ?'
    ).get(id) as { cnt: number };
    refCount = row.cnt;
  }

  if (refCount > 0) {
    return {
      success: false,
      referenceCount: refCount,
      message: `该客商已被 ${refCount} 条记录引用，无法删除`,
    };
  }

  db.prepare('DELETE FROM partners WHERE id = ?').run(id);
  return { success: true };
}

/**
 * 快速创建客商。
 *
 * 若同名同 type 已存在则直接返回已有记录（静默选中），
 * 否则以最小字段创建新客商（contact/phone/address/remark 均为空）。
 *
 * @param name - 客商名称
 * @param type - 客商类型 ('supplier' | 'customer')
 * @returns { id, name, type } 供前端 Autocomplete 选中
 */
export function quickCreatePartner(
  name: string,
  type: 'supplier' | 'customer'
): { id: string; name: string; type: string } {
  const db = initDb();

  // 检查是否已存在同名同类型客商
  const existing = db.prepare(
    'SELECT id, name, type FROM partners WHERE name = ? AND type = ?'
  ).get(name, type) as { id: string; name: string; type: string } | undefined;

  if (existing) {
    return existing;
  }

  // 不存在则创建
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO partners (id, name, type, contact, phone, address, remark, created_at, updated_at)
     VALUES (?, ?, ?, '', '', '', '', ?, ?)`
  ).run(id, name, type, now, now);

  return { id, name, type };
}
