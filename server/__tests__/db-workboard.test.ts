/**
 * @vitest-environment node
 *
 * 工作板数据库表测试 — 表初始化 + CRUD（内存 SQLite）
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

import { initWorkboardTables } from '../db-workboard.js';

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  initWorkboardTables(db);
});

describe('initWorkboardTables', () => {
  it('应创建 workboard_tasks 与 workboard_workers 表', () => {
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'workboard_%'")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('workboard_tasks');
    expect(names).toContain('workboard_workers');
  });

  it('幂等：重复初始化不报错', () => {
    expect(() => initWorkboardTables(db)).not.toThrow();
  });
});

describe('workboard_tasks CRUD', () => {
  it('插入、查询、更新、删除任务', () => {
    const now = new Date().toISOString();
    const insert = db.prepare(
      `INSERT INTO workboard_tasks (id, session_id, title, description, status, priority, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run('task-1', 'sess-1', 'Task One', 'desc', 'pending', 'normal', 0, now, now);

    const row = db.prepare('SELECT * FROM workboard_tasks WHERE id = ?').get('task-1') as {
      id: string;
      title: string;
      status: string;
    };
    expect(row.id).toBe('task-1');
    expect(row.title).toBe('Task One');
    expect(row.status).toBe('pending');

    // 更新
    db.prepare("UPDATE workboard_tasks SET status = 'done', updated_at = ? WHERE id = ?").run(now, 'task-1');
    const updated = db.prepare('SELECT status FROM workboard_tasks WHERE id = ?').get('task-1') as {
      status: string;
    };
    expect(updated.status).toBe('done');

    // 删除
    db.prepare('DELETE FROM workboard_tasks WHERE id = ?').run('task-1');
    const after = db.prepare('SELECT * FROM workboard_tasks WHERE id = ?').get('task-1');
    expect(after).toBeUndefined();
  });

  it('按 session_id 过滤任务', () => {
    const now = new Date().toISOString();
    const ins = db.prepare(
      `INSERT INTO workboard_tasks (id, session_id, title, status, priority, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    ins.run('t-a', 'sess-A', 'A', 'pending', 'normal', 0, now, now);
    ins.run('t-b', 'sess-B', 'B', 'pending', 'normal', 0, now, now);
    ins.run('t-c', 'sess-A', 'C', 'pending', 'normal', 0, now, now);

    const rows = db.prepare('SELECT id FROM workboard_tasks WHERE session_id = ? ORDER BY id').all('sess-A') as {
      id: string;
    }[];
    expect(rows.map((r) => r.id)).toEqual(['t-a', 't-c']);
  });
});

describe('workboard_workers CRUD', () => {
  it('插入、查询、更新 worker', () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO workboard_workers (id, name, type, status, created_at) VALUES (?, ?, ?, ?, ?)`,
    ).run('worker-1', 'Agent1', 'agent', 'idle', now);

    const row = db.prepare('SELECT * FROM workboard_workers WHERE id = ?').get('worker-1') as {
      id: string;
      name: string;
      status: string;
    };
    expect(row.name).toBe('Agent1');
    expect(row.status).toBe('idle');

    // 领取任务后更新状态
    db.prepare("UPDATE workboard_workers SET status = 'busy', current_task_id = ? WHERE id = ?").run(
      'task-1',
      'worker-1',
    );
    const updated = db.prepare('SELECT status, current_task_id FROM workboard_workers WHERE id = ?').get(
      'worker-1',
    ) as { status: string; current_task_id: string };
    expect(updated.status).toBe('busy');
    expect(updated.current_task_id).toBe('task-1');
  });
});
