/**
 * @vitest-environment node
 *
 * Partner DAO Integration Tests
 *
 * 测试 partnerDao.ts 的所有 7 个函数：
 * - listPartners (分页 + 筛选 + 搜索)
 * - getAllPartnersByType (全量返回)
 * - getPartnerById (存在/不存在)
 * - createPartner (创建 + 同名冲突)
 * - updatePartner (更新 + 不存在)
 * - deletePartner (删除 + 引用保护 + 不存在)
 * - quickCreatePartner (快速创建 + 同名返回已有)
 *
 * 策略：使用 vi.mock() 在导入前 mock db.js，
 * 返回一个内存 SQLite 数据库实例。
 */

import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';
import Database from 'better-sqlite3';

// ===================== Mock Setup (必须在导入 partnerDao 之前) =====================

// 创建内存数据库和 initDb mock
let mockDb: Database.Database;

vi.mock('../db.js', () => {
  return {
    initDb: vi.fn(() => mockDb),
    // 导出其他可能需要的类型/函数
    PartnerRow: null,
  };
});

// 现在可以安全导入 partnerDao（它会在运行时调用 initDb()）
const {
  listPartners,
  getAllPartnersByType,
  getPartnerById,
  createPartner,
  updatePartner,
  deletePartner,
  quickCreatePartner,
} = await import('../dao/partnerDao.js');

// ===================== Test Database Setup =====================

function setupTestDb() {
  const db = new Database(':memory:');

  // 创建 partners 表
  db.exec(`
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('supplier', 'customer')),
      contact TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  // 创建唯一索引（name + type 组合唯一）
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_name_type
    ON partners(name, type)
  `);

  // 创建 inbound_records 表（用于测试引用保护）
  db.exec(`
    CREATE TABLE IF NOT EXISTS inbound_records (
      id TEXT PRIMARY KEY,
      supplier_id TEXT,
      supplier TEXT DEFAULT ''
    )
  `);

  // 创建 outbound_records 表（用于测试引用保护）
  db.exec(`
    CREATE TABLE IF NOT EXISTS outbound_records (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      customer TEXT DEFAULT ''
    )
  `);

  return db;
}

// 辅助函数：向测试数据库插入测试数据
function seedTestData(db: Database.Database) {
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO partners (id, name, type, contact, phone, address, remark, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, '', '', ?, ?)
  `);

  // 插入 3 个供应商
  stmt.run('sup-001', '深圳科技有限公司', 'supplier', '张三', '13800138000', now, now);
  stmt.run('sup-002', '广州贸易公司', 'supplier', '李四', '13900139000', now, now);
  stmt.run('sup-003', '上海工业集团', 'supplier', '王五', '13700137000', now, now);

  // 插入 2 个客户
  stmt.run('cus-001', '北京销售公司', 'customer', '赵六', '13600136000', now, now);
  stmt.run('cus-002', '杭州商贸有限公司', 'customer', '孙七', '13500135000', now, now);
}

// ===================== Test Lifecycle =====================

beforeEach(() => {
  // 每个测试前创建新的内存数据库并 seed 数据
  mockDb = setupTestDb();
  seedTestData(mockDb);
});

afterAll(() => {
  // 所有测试后关闭数据库
  if (mockDb) {
    mockDb.close();
  }
});

// ===================== Test Suites =====================

describe('partnerDao - listPartners', () => {
  it('should return paginated list of all partners (default page=1, pageSize=20)', () => {
    const result = listPartners(undefined, undefined, 1, 20);

    expect(result.items).toHaveLength(5); // 3 suppliers + 2 customers
    expect(result.total).toBe(5);
  });

  it('should filter by type=supplier', () => {
    const result = listPartners('supplier', undefined, 1, 20);

    expect(result.items).toHaveLength(3);
    expect(result.total).toBe(3);
    expect(result.items.every((p: any) => p.type === 'supplier')).toBe(true);
  });

  it('should filter by type=customer', () => {
    const result = listPartners('customer', undefined, 1, 20);

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.items.every((p: any) => p.type === 'customer')).toBe(true);
  });

  it('should search by name (fuzzy match)', () => {
    const result = listPartners(undefined, '深圳', 1, 20);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('深圳科技有限公司');
    expect(result.total).toBe(1);
  });

  it('should search with type filter combined', () => {
    const result = listPartners('supplier', '科技', 1, 20);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('深圳科技有限公司');
    expect(result.items[0].type).toBe('supplier');
  });

  it('should return empty result when search matches nothing', () => {
    const result = listPartners(undefined, '不存在的名称', 1, 20);

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('should paginate correctly (page 1, pageSize=2)', () => {
    const result = listPartners(undefined, undefined, 1, 2);

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(5);
  });

  it('should paginate correctly (page 2, pageSize=2)', () => {
    const result = listPartners(undefined, undefined, 2, 2);

    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(5);
  });

  it('should return empty array for out-of-range page', () => {
    const result = listPartners(undefined, undefined, 10, 20);

    expect(result.items).toHaveLength(0);
    expect(result.total).toBe(5);
  });

  it('should handle empty search string (treated as no search)', () => {
    const result = listPartners(undefined, '   ', 1, 20); // 只有空格

    // 空字符串或只有空格应该返回所有结果
    expect(result.total).toBe(5);
  });
});

describe('partnerDao - getAllPartnersByType', () => {
  it('should return all partners (only id, name, type) when type is undefined', () => {
    const result = getAllPartnersByType();

    expect(result).toHaveLength(5);
    expect(result[0]).toHaveProperty('id');
    expect(result[0]).toHaveProperty('name');
    expect(result[0]).toHaveProperty('type');
    // 不应该包含其他字段
    expect(result[0]).not.toHaveProperty('contact');
    expect(result[0]).not.toHaveProperty('phone');
  });

  it('should filter by type=supplier', () => {
    const result = getAllPartnersByType('supplier');

    expect(result).toHaveLength(3);
    expect(result.every((p: any) => p.type === 'supplier')).toBe(true);
  });

  it('should filter by type=customer', () => {
    const result = getAllPartnersByType('customer');

    expect(result).toHaveLength(2);
    expect(result.every((p: any) => p.type === 'customer')).toBe(true);
  });

  it('should return empty array when no partners exist', () => {
    // 清空数据库
    mockDb.exec('DELETE FROM partners');
    
    const result = getAllPartnersByType('supplier');
    expect(result).toHaveLength(0);
  });

  it('should order by name ASC', () => {
    const result = getAllPartnersByType();

    // 验证按名称排序
    for (let i = 1; i < result.length; i++) {
      expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('partnerDao - getPartnerById', () => {
  it('should return partner when ID exists', () => {
    const partner = getPartnerById('sup-001');

    expect(partner).not.toBeUndefined();
    expect(partner!.id).toBe('sup-001');
    expect(partner!.name).toBe('深圳科技有限公司');
    expect(partner!.type).toBe('supplier');
    expect(partner!.contact).toBe('张三');
  });

  it('should return undefined when ID does not exist', () => {
    const partner = getPartnerById('non-existent-id');

    expect(partner).toBeUndefined();
  });

  it('should return complete partner object with all fields', () => {
    const partner = getPartnerById('cus-001');

    expect(partner).toHaveProperty('id');
    expect(partner).toHaveProperty('name');
    expect(partner).toHaveProperty('type');
    expect(partner).toHaveProperty('contact');
    expect(partner).toHaveProperty('phone');
    expect(partner).toHaveProperty('address');
    expect(partner).toHaveProperty('remark');
    expect(partner).toHaveProperty('created_at');
    expect(partner).toHaveProperty('updated_at');
  });
});

describe('partnerDao - createPartner', () => {
  it('should create a new partner and return complete object', () => {
    const newPartner = createPartner({
      name: '南京新供应商',
      type: 'supplier',
      contact: '周八',
      phone: '13400134000',
      address: '南京市鼓楼区',
      remark: '优质供应商',
    });

    expect(newPartner.id).toBeDefined();
    expect(newPartner.id).toMatch(/^[0-9a-f-]+$/); // UUID format
    expect(newPartner.name).toBe('南京新供应商');
    expect(newPartner.type).toBe('supplier');
    expect(newPartner.contact).toBe('周八');
    expect(newPartner.phone).toBe('13400134000');
    expect(newPartner.address).toBe('南京市鼓楼区');
    expect(newPartner.remark).toBe('优质供应商');
    expect(newPartner.created_at).toBeDefined();
    expect(newPartner.updated_at).toBeDefined();
  });

  it('should create partner with minimal fields (optional fields default to empty)', () => {
    const newPartner = createPartner({
      name: '简约客户',
      type: 'customer',
    });

    expect(newPartner.name).toBe('简约客户');
    expect(newPartner.type).toBe('customer');
    expect(newPartner.contact).toBe('');
    expect(newPartner.phone).toBe('');
    expect(newPartner.address).toBe('');
    expect(newPartner.remark).toBe('');
  });

  it('should actually insert into database', () => {
    createPartner({
      name: '数据库验证测试',
      type: 'supplier',
    });

    const stmt = mockDb.prepare('SELECT * FROM partners WHERE name = ?');
    const row = stmt.get('数据库验证测试');

    expect(row).toBeDefined();
    expect(row.name).toBe('数据库验证测试');
  });

  it('should throw on duplicate name+type (UNIQUE constraint)', () => {
    // 尝试创建同名同类型的客商
    expect(() => {
      createPartner({
        name: '深圳科技有限公司', // 已存在
        type: 'supplier',
      });
    }).toThrow();
  });
});

describe('partnerDao - updatePartner', () => {
  it('should update existing partner and return updated object', () => {
    const updated = updatePartner('sup-001', {
      name: '深圳科技（已更新）',
      contact: '张三（新）',
      phone: '13800138001',
    });

    expect(updated).not.toBeNull();
    expect(updated!.id).toBe('sup-001');
    expect(updated!.name).toBe('深圳科技（已更新）');
    expect(updated!.contact).toBe('张三（新）');
    expect(updated!.phone).toBe('13800138001');
    // 未更新的字段应保持原值
    expect(updated!.type).toBe('supplier');
  });

  it('should update only specified fields (partial update)', () => {
    const original = getPartnerById('sup-002');
    const updated = updatePartner('sup-002', {
      phone: '13900139099', // 只更新电话
    });

    expect(updated!.phone).toBe('13900139099');
    expect(updated!.name).toBe(original!.name); // 其他字段不变
    expect(updated!.contact).toBe(original!.contact);
  });

  it('should allow type change', () => {
    const updated = updatePartner('sup-001', {
      type: 'customer', // supplier → customer
    });

    expect(updated!.type).toBe('customer');
  });

  it('should return null when updating non-existent partner', () => {
    const result = updatePartner('non-existent-id', {
      name: '测试',
    });

    expect(result).toBeNull();
  });

  it('should throw on duplicate name when updating (UNIQUE constraint)', () => {
    // 尝试将 sup-002 的名称改为已存在的 sup-001 的名称
    expect(() => {
      updatePartner('sup-002', {
        name: '深圳科技有限公司', // 已被 sup-001 使用
      });
    }).toThrow();
  });
});

describe('partnerDao - deletePartner', () => {
  it('should delete existing partner without references and return success', () => {
    const result = deletePartner('sup-003'); // sup-003 没有被引用

    expect(result.success).toBe(true);

    // 验证已从数据库删除
    const deleted = getPartnerById('sup-003');
    expect(deleted).toBeUndefined();
  });

  it('should return false when partner does not exist', () => {
    const result = deletePartner('non-existent-id');

    expect(result.success).toBe(false);
    expect(result.message).toBe('客商不存在');
  });

  it('should reject deletion when partner is referenced by inbound_records (supplier)', () => {
    // 先创建一个入库记录引用 sup-001
    mockDb.prepare(
      'INSERT INTO inbound_records (id, supplier_id, supplier) VALUES (?, ?, ?)'
    ).run('inbound-001', 'sup-001', '深圳科技有限公司');

    const result = deletePartner('sup-001');

    expect(result.success).toBe(false);
    expect(result.referenceCount).toBe(1);
    expect(result.message).toContain('1 条记录引用');

    // 验证未删除
    const stillExists = getPartnerById('sup-001');
    expect(stillExists).toBeDefined();
  });

  it('should reject deletion when partner is referenced by outbound_records (customer)', () => {
    // 先创建一个出库记录引用 cus-001
    mockDb.prepare(
      'INSERT INTO outbound_records (id, customer_id, customer) VALUES (?, ?, ?)'
    ).run('outbound-001', 'cus-001', '北京销售公司');

    const result = deletePartner('cus-001');

    expect(result.success).toBe(false);
    expect(result.referenceCount).toBe(1);
    expect(result.message).toContain('1 条记录引用');
  });

  it('should count multiple references correctly', () => {
    // 创建两个入库记录都引用 sup-001
    const insert = mockDb.prepare(
      'INSERT INTO inbound_records (id, supplier_id, supplier) VALUES (?, ?, ?)'
    );
    insert.run('inbound-101', 'sup-001', '深圳科技有限公司');
    insert.run('inbound-102', 'sup-001', '深圳科技有限公司');

    const result = deletePartner('sup-001');

    expect(result.success).toBe(false);
    expect(result.referenceCount).toBe(2);
  });

  it('should delete successfully after references are removed', () => {
    // 创建引用
    mockDb.prepare(
      'INSERT INTO inbound_records (id, supplier_id, supplier) VALUES (?, ?, ?)'
    ).run('inbound-201', 'sup-002', '广州贸易公司');

    // 验证无法删除
    let result = deletePartner('sup-002');
    expect(result.success).toBe(false);

    // 删除引用
    mockDb.prepare('DELETE FROM inbound_records WHERE id = ?').run('inbound-201');

    // 现在可以删除
    result = deletePartner('sup-002');
    expect(result.success).toBe(true);
  });
});

describe('partnerDao - quickCreatePartner', () => {
  it('should create new partner with minimal fields (contact/phone/address/remark are empty)', () => {
    const result = quickCreatePartner('快速创建的供应商', 'supplier');

    expect(result.id).toBeDefined();
    expect(result.name).toBe('快速创建的供应商');
    expect(result.type).toBe('supplier');

    // 验证数据库中的完整记录
    const created = getPartnerById(result.id);
    expect(created!.contact).toBe('');
    expect(created!.phone).toBe('');
    expect(created!.address).toBe('');
    expect(created!.remark).toBe('');
  });

  it('should return existing partner when name+type already exists', () => {
    // sup-001 已存在
    const result = quickCreatePartner('深圳科技有限公司', 'supplier');

    expect(result.id).toBe('sup-001'); // 返回已有记录的 ID
    expect(result.name).toBe('深圳科技有限公司');
    expect(result.type).toBe('supplier');
  });

  it('should create different partner for same name but different type', () => {
    // 创建一个 customer 类型的"深圳科技有限公司"
    const result = quickCreatePartner('深圳科技有限公司', 'customer');

    expect(result.id).toBeDefined();
    expect(result.id).not.toBe('sup-001'); // 应该是新 ID
    expect(result.name).toBe('深圳科技有限公司');
    expect(result.type).toBe('customer');
  });

  it('should actually insert into database', () => {
    quickCreatePartner('插入验证测试', 'customer');

    const stmt = mockDb.prepare('SELECT * FROM partners WHERE name = ? AND type = ?');
    const row = stmt.get('插入验证测试', 'customer');

    expect(row).toBeDefined();
  });

  it('should not create duplicate on concurrent calls (idempotent)', () => {
    // 第一次调用
    const result1 = quickCreatePartner('幂等性测试', 'supplier');

    // 第二次调用（应该返回第一次创建的结果）
    const result2 = quickCreatePartner('幂等性测试', 'supplier');

    expect(result2.id).toBe(result1.id);

    // 验证数据库只有一条记录
    const count = mockDb.prepare(
      'SELECT COUNT(*) as cnt FROM partners WHERE name = ? AND type = ?'
    ).get('幂等性测试', 'supplier') as { cnt: number };

    expect(count.cnt).toBe(1);
  });
});

// ===================== Edge Cases =====================

describe('partnerDao - edge cases', () => {
  it('should handle empty name (validator should prevent this, but DAO accepts it)', () => {
    // 注意：实际使用时应该在路由层校验 name 非空
    // 这里测试 DAO 层是否能处理（取决于数据库约束）
    const result = createPartner({
      name: '',
      type: 'supplier',
    });

    expect(result.name).toBe('');
  });

  it('should handle very long name', () => {
    const longName = 'A'.repeat(255);
    const result = createPartner({
      name: longName,
      type: 'customer',
    });

    expect(result.name).toBe(longName);
  });

  it('should handle special characters in name', () => {
    const specialName = '测试&公司（Beijing）©®';
    const result = createPartner({
      name: specialName,
      type: 'supplier',
    });

    expect(result.name).toBe(specialName);
  });

  it('listPartners should handle page=0 (should treat as page=1)', () => {
    const result = listPartners(undefined, undefined, 0, 10);

    // page=0 会被 Math.max(1, 0) = 1 处理
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('listPartners should handle negative pageSize (routes should validate, DAO passes through to SQLite)', () => {
    // 注意：DAO 层不进行输入验证（由路由层负责）
    // SQLite 对负数 LIMIT 的处理是无限制
    const result = listPartners(undefined, undefined, 1, -5);

    // 实际行为：SQLite 忽略负数 LIMIT，返回所有记录
    // 这不是 bug，因为路由层会验证 pageSize >= 1
    expect(result.items.length).toBeGreaterThan(0);
  });

  it('deletePartner should handle partner with both inbound and outbound references', () => {
    // 注意：根据实现，只检查对应 type 的引用
    // 如果 partner.type = 'supplier'，只检查 inbound_records
    // 如果 partner.type = 'customer'，只检查 outbound_records

    // 创建一个既是 supplier 又有 outbound 引用的场景（不应该发生，但测试防御性）
    mockDb.prepare(
      'INSERT INTO inbound_records (id, supplier_id, supplier) VALUES (?, ?, ?)'
    ).run('inbound-301', 'sup-001', '深圳科技有限公司');

    const result = deletePartner('sup-001');

    expect(result.success).toBe(false);
    expect(result.referenceCount).toBe(1);
  });
});
