/**
 * SQLite 表结构迁移幂等性测试
 *
 * 验证 initWmsTables / initStaffTables 多次调用不会报错、不会重建已有表、
 * 不会丢失已有数据。这是冷启动稳定性的关键保障。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { initWmsTables } from '../db-wms.js';
import { initStaffTables, DEFAULT_TENANT_ID } from '../db-staff.js';

describe('SQLite 迁移幂等性', () => {
  let db: DatabaseType;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  describe('initWmsTables 幂等性', () => {
    it('多次调用不应抛错', () => {
      expect(() => initWmsTables(db)).not.toThrow();
      expect(() => initWmsTables(db)).not.toThrow();
      expect(() => initWmsTables(db)).not.toThrow();
    });

    it('多次调用后表结构仍可用', () => {
      initWmsTables(db);
      initWmsTables(db);

      // 验证关键表存在且可写入
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='warehouses'")
        .all() as Array<{ name: string }>;
      expect(tables.length).toBeGreaterThan(0);

      // 插入仓库记录验证可用
      db.prepare(
        `INSERT INTO warehouses (id, name, country, city, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('wh-test', '测试仓库', 'CN', '北京', 'normal', new Date().toISOString());
      const row = db.prepare('SELECT * FROM warehouses WHERE id = ?').get('wh-test');
      expect(row).toBeTruthy();
    });

    it('多次调用不应清空已有数据', () => {
      initWmsTables(db);
      db.prepare(
        `INSERT INTO warehouses (id, name, country, city, status, createdAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run('wh-1', '原仓库', 'CN', '上海', 'normal', new Date().toISOString());

      // 再次调用迁移
      initWmsTables(db);

      const row = db.prepare('SELECT * FROM warehouses WHERE id = ?').get('wh-1');
      expect(row).toBeTruthy();
    });
  });

  describe('initStaffTables 幂等性', () => {
    it('多次调用不应抛错', () => {
      expect(() => initStaffTables(db)).not.toThrow();
      expect(() => initStaffTables(db)).not.toThrow();
      expect(() => initStaffTables(db)).not.toThrow();
    });

    it('多次调用后 sd_sessions 仍可写入', () => {
      initStaffTables(db);
      initStaffTables(db);

      db.prepare(
        `INSERT INTO sd_sessions (id, tenant_id, agent_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('sess-1', DEFAULT_TENANT_ID, 'agent-1', '测试', 'active', 1, 1);

      const row = db.prepare('SELECT * FROM sd_sessions WHERE id = ?').get('sess-1');
      expect(row).toBeTruthy();
    });

    it('多次调用不应清空已有 sessions', () => {
      initStaffTables(db);
      db.prepare(
        `INSERT INTO sd_sessions (id, tenant_id, agent_id, title, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run('sess-1', DEFAULT_TENANT_ID, 'agent-1', '保留', 'active', 1, 1);

      initStaffTables(db);

      const row = db.prepare('SELECT * FROM sd_sessions WHERE id = ?').get('sess-1');
      expect(row).toBeTruthy();
    });
  });

  describe('initWmsTables + initStaffTables 共存', () => {
    it('两个迁移函数可在同一 DB 上交替调用', () => {
      expect(() => {
        initWmsTables(db);
        initStaffTables(db);
        initWmsTables(db);
        initStaffTables(db);
      }).not.toThrow();

      const wmsTables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='warehouses'")
        .all();
      const staffTables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sd_%'")
        .all();
      expect(wmsTables.length).toBeGreaterThan(0);
      expect(staffTables.length).toBeGreaterThan(0);
    });
  });
});
