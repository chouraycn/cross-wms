/**
 * SQLite Worker Thread
 *
 * 在独立线程中运行 better-sqlite3 同步操作，
 * 通过 parentPort 接收查询请求并返回结果。
 */
import { parentPort, workerData } from 'worker_threads';
import Database from 'better-sqlite3';

const DB_PATH = workerData.dbPath as string;

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

// 监听主线程消息
parentPort?.on('message', (msg) => {
  const { id, type, sql, params, method } = msg;

  try {
    const database = getDb();
    let result: any;

    switch (type) {
      case 'prepare': {
        // 预编译语句执行
        const stmt = database.prepare(sql);
        if (method === 'all') {
          result = stmt.all(...(params || []));
        } else if (method === 'get') {
          result = stmt.get(...(params || []));
        } else if (method === 'run') {
          result = stmt.run(...(params || []));
        } else {
          result = stmt.run(...(params || []));
        }
        break;
      }
      case 'exec': {
        database.exec(sql);
        result = undefined;
        break;
      }
      case 'pragma': {
        result = database.pragma(sql);
        break;
      }
      case 'transaction': {
        // 批量操作在事务中执行
        const txn = database.transaction(() => {
          for (const op of (params || [])) {
            const s = database.prepare(op.sql);
            s.run(...(op.params || []));
          }
        });
        txn();
        result = undefined;
        break;
      }
      case 'close': {
        database.close();
        db = null;
        result = undefined;
        break;
      }
      default:
        throw new Error(`Unknown worker message type: ${type}`);
    }

    parentPort?.postMessage({ id, result, error: null });
  } catch (err) {
    parentPort?.postMessage({ id, result: null, error: (err as Error).message });
  }
});
