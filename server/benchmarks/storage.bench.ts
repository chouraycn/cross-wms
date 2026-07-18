/**
 * 存储基准测试
 *
 * 测试 SQLite、Redis、向量搜索等存储相关操作的性能。
 * 使用小数据量快速运行，确保框架可用。
 */
import Database from 'better-sqlite3';
import { BenchmarkRunner } from '@cdf-know/benchmark';

const runner = new BenchmarkRunner({ defaultIterations: 10, defaultWarmup: 2 });

/**
 * 创建内存 SQLite 数据库用于测试
 */
function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS benchmark_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  return db;
}

/**
 * SQLite 批量插入测试
 */
async function sqliteBatchInsert() {
  const result = await runner.run(
    'SQLite 批量 insert 100 条',
    () => {
      const db = createTestDb();
      const stmt = db.prepare('INSERT INTO benchmark_items (name, value, created_at) VALUES (?, ?, ?)');
      const insertMany = db.transaction((items: Array<{ name: string; value: string; ts: number }>) => {
        for (const item of items) {
          stmt.run(item.name, item.value, item.ts);
        }
      });

      const items = Array.from({ length: 100 }, (_, i) => ({
        name: `item-${i}`,
        value: `value-${i}-${Math.random()}`,
        ts: Date.now(),
      }));

      insertMany(items);
      db.close();
    },
    { iterations: 10, warmup: 2 },
  );
  return result;
}

/**
 * SQLite 查询测试
 */
async function sqliteQuery() {
  const db = createTestDb();
  const stmt = db.prepare('INSERT INTO benchmark_items (name, value, created_at) VALUES (?, ?, ?)');
  for (let i = 0; i < 100; i++) {
    stmt.run(`item-${i}`, `value-${i}`, Date.now());
  }

  const queryStmt = db.prepare('SELECT * FROM benchmark_items WHERE id = ?');

  const result = await runner.run(
    'SQLite 查询 100 次',
    () => {
      for (let i = 1; i <= 100; i++) {
        queryStmt.get(i);
      }
    },
    { iterations: 10, warmup: 2 },
  );

  db.close();
  return result;
}

/**
 * 简易内存 KV 模拟 Redis 读写测试
 * （避免依赖真实 Redis 服务）
 */
async function redisKVReadWrite() {
  const store = new Map<string, string>();
  const keys: string[] = [];

  for (let i = 0; i < 1000; i++) {
    const key = `key-${i}`;
    store.set(key, `value-${i}-${Math.random()}`);
    keys.push(key);
  }

  const result = await runner.run(
    'KV 读写 1000 次',
    () => {
      for (let i = 0; i < 1000; i++) {
        const key = keys[i % keys.length];
        store.get(key);
        store.set(key, `updated-${Date.now()}`);
      }
    },
    { iterations: 10, warmup: 2 },
  );

  return result;
}

/**
 * 向量相似度搜索测试（简单模拟）
 * 使用余弦相似度计算
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function vectorSimilaritySearch() {
  const vectors: number[][] = [];
  const dim = 128;
  const count = 100;

  for (let i = 0; i < count; i++) {
    const vec = new Array(dim);
    for (let j = 0; j < dim; j++) {
      vec[j] = Math.random();
    }
    vectors.push(vec);
  }

  const query = new Array(dim);
  for (let i = 0; i < dim; i++) {
    query[i] = Math.random();
  }

  const result = await runner.run(
    '向量相似度搜索 100 次',
    () => {
      const results = vectors.map((vec, idx) => ({
        idx,
        score: cosineSimilarity(query, vec),
      }));
      results.sort((a, b) => b.score - a.score);
      return results.slice(0, 10);
    },
    { iterations: 10, warmup: 2 },
  );

  return result;
}

export async function runStorageBenchmarks() {
  console.log('\n=== 存储基准测试 ===\n');

  const results = [];

  results.push(await sqliteBatchInsert());
  results.push(await sqliteQuery());
  results.push(await redisKVReadWrite());
  results.push(await vectorSimilaritySearch());

  for (const r of results) {
    const formatted = runner.formatResult(r);
    console.log(`${formatted.name}:`);
    console.log(`  每秒操作: ${formatted.opsPerSecond.toFixed(2)} ops/s`);
    console.log(`  平均耗时: ${formatted.avgMs.toFixed(4)} ms`);
    console.log(`  P95: ${formatted.p95Ms.toFixed(4)} ms`);
    console.log('');
  }

  return results;
}

if (require.main === module) {
  runStorageBenchmarks().catch(console.error);
}
