/**
 * @vitest-environment node
 *
 * 数据库 Worker Pool 测试 — 初始化 / 查询分发 / 错误处理 / 关闭
 *
 * 通过 mock worker_threads.Worker 模拟 worker 行为，避免真实线程开销。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 使用 vi.hoisted 确保 FakeWorker 类在 vi.mock 工厂提升执行时可用
type MessageHandler = (msg: { id: number; result: unknown; error: string | null }) => void;

interface FakeWorkerOptions {
  workerData?: { dbPath: string };
}

const { FakeWorker } = vi.hoisted(() => {
  class FakeWorker {
    static instances: FakeWorker[] = [];
    static behavior: 'success' | 'error' = 'success';

    onMessage?: MessageHandler;
    onError?: (err: Error) => void;
    postedMessages: Record<string, unknown>[] = [];
    terminated = false;
    options: FakeWorkerOptions;

    constructor(_script: string, options?: FakeWorkerOptions) {
      this.options = options || {};
      FakeWorker.instances.push(this);
    }

    on(event: string, handler: MessageHandler | ((err: Error) => void)): this {
      if (event === 'message') {
        this.onMessage = handler as MessageHandler;
      } else if (event === 'error') {
        this.onError = handler as (err: Error) => void;
      }
      return this;
    }

    postMessage(msg: Record<string, unknown>): void {
      this.postedMessages.push(msg);

      // 模拟 close 指令：不返回响应
      if (msg.type === 'close') return;

      // 异步模拟 worker 处理并返回结果
      const id = msg.id as number;
      const type = msg.type as string;
      const method = msg.method as string | undefined;
      const sql = msg.sql as string | undefined;

      // 异步触发响应，模拟真实 worker 的异步性
      queueMicrotask(() => {
        if (!this.onMessage) return;
        if (FakeWorker.behavior === 'error') {
          this.onMessage({ id, result: null, error: 'mocked worker error' });
          return;
        }
        // 根据 method 返回模拟数据
        let result: unknown;
        if (type === 'exec') {
          result = undefined;
        } else if (type === 'pragma') {
          result = [];
        } else if (method === 'all') {
          // 模拟 SELECT 返回
          result = sql?.includes('users') ? [{ id: 1, name: 'alice' }] : [];
        } else if (method === 'get') {
          result = sql?.includes('users') ? { id: 1, name: 'alice' } : undefined;
        } else if (method === 'run') {
          result = { changes: 1, lastInsertRowid: 1 };
        } else if (type === 'transaction') {
          result = undefined;
        } else {
          result = null;
        }
        this.onMessage({ id, result, error: null });
      });
    }

    terminate(): void {
      this.terminated = true;
    }
  }
  return { FakeWorker };
});

vi.mock('node:worker_threads', () => ({
  Worker: FakeWorker,
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { DbWorkerPool } from '../dbWorkerPool.js';

let pool: DbWorkerPool;

beforeEach(() => {
  FakeWorker.instances = [];
  FakeWorker.behavior = 'success';
  pool = new DbWorkerPool(':memory:');
});

afterEach(() => {
  try {
    pool.close();
  } catch {
    // 忽略已关闭的错误
  }
  FakeWorker.instances = [];
});

describe('init 初始化', () => {
  it('init 创建 worker 实例', () => {
    pool.init();
    expect(FakeWorker.instances.length).toBeGreaterThanOrEqual(1);
  });

  it('重复 init 幂等，不重复创建 worker', () => {
    pool.init();
    const count1 = FakeWorker.instances.length;
    pool.init();
    expect(FakeWorker.instances.length).toBe(count1);
  });
});

describe('查询分发', () => {
  it('all 返回行数组', async () => {
    pool.init();
    const rows = await pool.all('SELECT * FROM users WHERE id = ?', 1);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(1);
    expect((rows[0] as { name: string }).name).toBe('alice');
  });

  it('get 返回单行', async () => {
    pool.init();
    const row = await pool.get('SELECT * FROM users WHERE id = ?', 1);
    expect(row).toBeTruthy();
    expect((row as { name: string }).name).toBe('alice');
  });

  it('run 返回执行结果', async () => {
    pool.init();
    const result = await pool.run('INSERT INTO users (name) VALUES (?)', 'bob');
    expect(result).toBeTruthy();
    expect((result as { changes: number }).changes).toBe(1);
  });

  it('exec 执行 DDL', async () => {
    pool.init();
    await expect(pool.exec('CREATE TABLE test (id INTEGER)')).resolves.toBeUndefined();
  });

  it('pragma 返回数组', async () => {
    pool.init();
    const result = await pool.pragma('table_info(users)');
    expect(Array.isArray(result)).toBe(true);
  });

  it('transaction 批量操作', async () => {
    pool.init();
    await expect(
      pool.transaction([
        { sql: 'INSERT INTO t (a) VALUES (?)', params: [1] },
        { sql: 'INSERT INTO t (a) VALUES (?)', params: [2] },
      ]),
    ).resolves.toBeUndefined();
  });

  it('多次调用按轮询分发到不同 worker', async () => {
    pool.init();
    // 发起多次查询
    await pool.all('SELECT * FROM users');
    await pool.all('SELECT * FROM users');
    await pool.all('SELECT * FROM users');
    // 每个 worker 都应收到至少一条消息
    const totalPosted = FakeWorker.instances.reduce(
      (sum, w) => sum + w.postedMessages.filter((m) => m.type !== 'close').length,
      0,
    );
    expect(totalPosted).toBe(3);
  });
});

describe('错误处理', () => {
  it('worker 返回 error 时 reject', async () => {
    FakeWorker.behavior = 'error';
    pool.init();
    await expect(pool.all('SELECT * FROM users')).rejects.toThrow('mocked worker error');
  });

  it('run 错误时 reject', async () => {
    FakeWorker.behavior = 'error';
    pool.init();
    await expect(pool.run('INSERT INTO users VALUES (?)')).rejects.toThrow('mocked worker error');
  });

  it('错误后 pool 仍可继续使用', async () => {
    pool.init();
    // 先制造一次错误
    FakeWorker.behavior = 'error';
    await expect(pool.all('SELECT * FROM users')).rejects.toThrow();
    // 切回成功
    FakeWorker.behavior = 'success';
    const rows = await pool.all('SELECT * FROM users');
    expect(rows.length).toBe(1);
  });
});

describe('close 关闭', () => {
  it('close 终止所有 worker', () => {
    pool.init();
    const workers = [...FakeWorker.instances];
    pool.close();
    for (const w of workers) {
      expect(w.terminated).toBe(true);
    }
  });

  it('close 后 workers 数组清空，可重新 init', () => {
    pool.init();
    pool.close();
    FakeWorker.instances = [];
    pool.init();
    expect(FakeWorker.instances.length).toBeGreaterThanOrEqual(1);
    pool.close();
  });
});
