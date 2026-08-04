/**
 * @vitest-environment node
 *
 * StaffDeck 数据库表测试 — 表初始化 + CRUD（内存 SQLite）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { initStaffTables, newStaffId, DEFAULT_TENANT_ID } from '../db-staff.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  initStaffTables(db);
});

describe('initStaffTables', () => {
  it('应创建核心 sd_ 前缀表', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'sd_%'")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('sd_tenants');
    expect(names).toContain('sd_users');
    expect(names).toContain('sd_agent_profiles');
    expect(names).toContain('sd_sessions');
    expect(names).toContain('sd_messages');
    expect(names).toContain('sd_model_configs');
    expect(names.length).toBeGreaterThanOrEqual(20);
  });

  it('幂等：重复初始化不报错', () => {
    expect(() => initStaffTables(db)).not.toThrow();
  });

  it('初始化默认租户', () => {
    const tenant = db.prepare('SELECT id, name FROM sd_tenants WHERE id = ?').get(DEFAULT_TENANT_ID) as {
      id: string;
      name: string;
    };
    expect(tenant).toBeTruthy();
    expect(tenant.id).toBe(DEFAULT_TENANT_ID);
  });

  it('初始化默认 UI 配置与 Persona 配置', () => {
    const ui = db.prepare('SELECT tenant_id FROM sd_ui_configs WHERE tenant_id = ?').get(DEFAULT_TENANT_ID);
    const persona = db
      .prepare('SELECT tenant_id, system_prompt FROM sd_persona_configs WHERE tenant_id = ?')
      .get(DEFAULT_TENANT_ID) as { system_prompt: string };
    expect(ui).toBeTruthy();
    expect(persona).toBeTruthy();
    expect(persona.system_prompt.length).toBeGreaterThan(0);
  });
});

describe('newStaffId', () => {
  it('生成带前缀的 ID', () => {
    const id = newStaffId('agent');
    expect(id).toMatch(/^agent_[0-9a-f]{16}$/);
  });

  it('不同前缀生成不同 ID', () => {
    const a = newStaffId('skill');
    const b = newStaffId('tool');
    expect(a.startsWith('skill_')).toBe(true);
    expect(b.startsWith('tool_')).toBe(true);
    expect(a).not.toBe(b);
  });

  it('每次调用生成唯一 ID', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(newStaffId('mem'));
    }
    expect(ids.size).toBe(100);
  });
});

describe('sd_users CRUD', () => {
  it('插入、查询、更新、删除用户', () => {
    db.prepare(
      `INSERT INTO sd_users (id, tenant_id, username, display_name, role, password_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('user-1', DEFAULT_TENANT_ID, 'alice', 'Alice', 'admin', 'hashed');

    const row = db.prepare('SELECT * FROM sd_users WHERE id = ?').get('user-1') as {
      id: string;
      username: string;
      role: string;
    };
    expect(row.username).toBe('alice');
    expect(row.role).toBe('admin');

    // 更新
    db.prepare("UPDATE sd_users SET role = 'member', display_name = ? WHERE id = ?").run('Alice2', 'user-1');
    const updated = db.prepare('SELECT role, display_name FROM sd_users WHERE id = ?').get('user-1') as {
      role: string;
      display_name: string;
    };
    expect(updated.role).toBe('member');
    expect(updated.display_name).toBe('Alice2');

    // 唯一约束：同租户同用户名冲突
    expect(() =>
      db
        .prepare(
          `INSERT INTO sd_users (id, tenant_id, username, role, password_hash) VALUES (?, ?, ?, ?, ?)`,
        )
        .run('user-2', DEFAULT_TENANT_ID, 'alice', 'member', 'hashed2'),
    ).toThrow();

    // 删除
    db.prepare('DELETE FROM sd_users WHERE id = ?').run('user-1');
    expect(db.prepare('SELECT * FROM sd_users WHERE id = ?').get('user-1')).toBeUndefined();
  });
});

describe('sd_sessions / sd_messages CRUD', () => {
  it('插入会话与消息并关联查询', () => {
    db.prepare(
      `INSERT INTO sd_sessions (id, tenant_id, title, status) VALUES (?, ?, ?, ?)`,
    ).run('sess-1', DEFAULT_TENANT_ID, 'Test Session', 'active');

    const insMsg = db.prepare(
      `INSERT INTO sd_messages (id, tenant_id, session_id, role, content) VALUES (?, ?, ?, ?, ?)`,
    );
    insMsg.run('msg-1', DEFAULT_TENANT_ID, 'sess-1', 'user', 'hello');
    insMsg.run('msg-2', DEFAULT_TENANT_ID, 'sess-1', 'assistant', 'hi there');

    const msgs = db
      .prepare('SELECT * FROM sd_messages WHERE session_id = ? ORDER BY id')
      .all('sess-1') as { id: string; role: string }[];
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('user');
    expect(msgs[1].role).toBe('assistant');
  });
});

describe('sd_model_configs CRUD', () => {
  it('插入与查询模型配置', () => {
    db.prepare(
      `INSERT INTO sd_model_configs (id, tenant_id, name, provider, model, api_key_encrypted, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run('model-1', DEFAULT_TENANT_ID, 'GPT-4', 'openai_compatible', 'gpt-4', 'enc-key', 1);

    const row = db.prepare('SELECT name, enabled, is_default FROM sd_model_configs WHERE id = ?').get(
      'model-1',
    ) as { name: string; enabled: number; is_default: number };
    expect(row.name).toBe('GPT-4');
    expect(row.enabled).toBe(1);
    expect(row.is_default).toBe(0);
  });
});
