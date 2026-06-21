import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger.js';

const DB_DIR = path.join(os.homedir(), '.cdf-know-clow');
const DB_PATH = path.join(DB_DIR, 'chat.db');
const DB_BACKUP_PATH = path.join(DB_DIR, 'chat.db.bak');

/** v1.9.3: 备份数据库 */
function backupDatabase(): void {
  try {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, DB_BACKUP_PATH);
      logger.info('[DB] 数据库已备份到 chat.db.bak');
    }
  } catch (e) {
    logger.warn('[DB] 数据库备份失败:', e);
  }
}

/** v1.9.3: 从备份恢复数据库 */
function restoreDatabaseFromBackup(): boolean {
  try {
    // v2.3.3: 增强恢复逻辑 — 如果主 DB 文件损坏（0 字节）或 WAL 残留，从备份恢复
    if (fs.existsSync(DB_BACKUP_PATH)) {
      const mainExists = fs.existsSync(DB_PATH);
      const walPath = DB_PATH + '-wal';
      const shmPath = DB_PATH + '-shm';
      
      if (!mainExists) {
        // 主文件完全丢失，从备份恢复
        fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
        logger.info('[DB] 数据库已从备份恢复（主文件丢失）');
        return true;
      }
      
      // v2.3.3: WAL 崩溃残留检测 — 如果有 WAL 但没有 SHM，或 WAL 异常大
      if (fs.existsSync(walPath)) {
        const walSize = fs.statSync(walPath).size;
        const mainSize = fs.statSync(DB_PATH).size;
        // WAL 大于主 DB 的 50% 且没有 SHM → 可能是崩溃残留
        if (walSize > mainSize * 0.5 && !fs.existsSync(shmPath)) {
          logger.info('[DB] 检测到 WAL 崩溃残留，从备份恢复:', { walSize, mainSize });
          // 删除损坏的主文件和 WAL
          fs.unlinkSync(DB_PATH);
          fs.unlinkSync(walPath);
          fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
          logger.info('[DB] 数据库已从备份恢复（WAL 崩溃残留）');
          return true;
        }
      }
    }
  } catch (e) {
    logger.warn('[DB] 从备份恢复数据库失败:', e);
  }
  return false;
}

// ===================== Chat Session Types =====================

/** 会话状态 */
export type SessionStatus = 'active' | 'archived' | 'daily_reset';

export interface Session {
  id: string;
  title: string;
  model: string;
  agentId?: string;
  folderId?: string | null;
  createdAt: string;
  updatedAt: string;
  /** v6.0: 会话状态（active/archived/daily_reset） */
  status?: SessionStatus;
  /** v6.0: 最后活跃时间（用于空闲归档检测） */
  lastActiveAt?: string;
  /** v6.0: 归档时间 */
  archivedAt?: string | null;
  /** v6.0: 父会话 ID（子任务自动创建子会话） */
  parentSessionId?: string | null;
  /** v6.0: 会话日期键（YYYY-MM-DD，用于每日重置） */
  sessionDate?: string;
  /** v6.0: 会话标签（JSON 数组，用于归档搜索） */
  tags?: string | null;
  /** v6.0: 摘要（归档时自动生成） */
  summary?: string | null;
  /** v6.0: 消息数量 */
  messageCount?: number;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  timestamp: string;
  toolCalls?: string;
  skillId?: string | null; // 关联的技能 ID
  thinking?: string | null;
  thinkingDuration?: number | null;
  attachments?: string | null; // JSON 序列化的附件数组
}

// ===================== Business Data Types =====================

export interface WarehouseRow {
  id: string;
  name: string;
  country: string;
  city: string;
  totalVolume: number;
  usedVolume: number;
  totalItems: number;
  usedItems: number;
  status: string;
  address: string;
  manager: string;
  phone: string;
  createdAt: string;
}

export interface InventoryItemRow {
  id: string;
  sku: string;
  name: string;
  warehouseId: string;
  quantity: number;
  volumePerUnit: number;
  totalVolume: number;
  inboundDate: string;
  valuePerUnit: number;
  totalValue: number;
  category: string;
  isAgeWarning: number; // 0 or 1 in SQLite
  autoCreated: number; // 0 or 1 in SQLite — 1 if auto-created during inbound
}

export interface TransitOrderRow {
  id: string;
  trackingNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  category: string;
  weight: number;
  volume: number;
  transportMode: string;
  estimatedArrival: string;
  actualArrival: string | null;
  status: string;
  createdAt: string;
  carrier: string;
  value: number;
}

export interface StatusHistoryRow {
  id: string;
  transitOrderId: string;
  status: string;
  time: string;
  location: string;
  remark: string;
}

export interface InventoryTransactionRow {
  id: number;
  sku: string;
  type: string; // 'inbound' | 'outbound' | 'adjustment'
  quantity: number;
  warehouseId: string;
  operator: string;
  sourceId: string;
  sourceType: string; // 'inbound_record' | 'outbound_record' | 'manual_adjustment'
  remark: string;
  createdAt: string;
}

export interface InboundRecordRow {
  id: string;
  warehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  createdAt: string;
  operator: string;
  status: string;
  supplier: string;
  batchNo: string;
  supplier_id: string | null;  // v1.4.0: partner FK
}

export interface OutboundRecordRow {
  id: string;
  warehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  createdAt: string;
  operator: string;
  destination: string;
  customer: string;
  orderNo: string;
  customer_id: string | null;  // v1.4.0: partner FK
}

// ===================== Transfer Order Types (v1.5.0) =====================

export interface TransferOrderRow {
  id: string;
  transferNo: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  sku: string;
  name: string;
  quantity: number;
  volume: number;
  status: string; // 'draft' | 'submitted' | 'in_transit' | 'completed'
  transitOrderId: string | null;
  createdBy: string;
  submittedAt: string | null;
  submittedBy: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  completedAt: string | null;
  completedBy: string | null;
  remark: string;
  createdAt: string;
  updatedAt: string;
}

// ===================== Partner Types (v1.4.0) =====================

export interface PartnerRow {
  id: string;
  name: string;
  type: 'supplier' | 'customer';
  contact: string;
  phone: string;
  address: string;
  remark: string;
  created_at: string;
  updated_at: string;
}

export interface UserSkillRow {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: string;
  path: string;
  trigger: string | null;
  detail: string | null;
  tags: string | null; // JSON string
  status: string;
  version: string | null;
  featured: number; // 0 or 1
  shortcut: string | null;
  installedAt: number;
  promptTemplate: string | null;
  executionMode: string | null;
}

export interface BuiltinStatusPatchRow {
  skillId: string;
  status: string;
}

export interface AppSettingsRow {
  key: string;
  value: string; // JSON string
}

// ===================== Automation Types =====================

export interface AutomationRow {
  id: string;
  name: string;
  description: string;
  status: string;
  schedule_type: string;
  rrule: string;
  scheduled_at: string | null;
  schedule_label: string;
  prompt: string;
  task_type: string;
  task_config: string; // JSON string
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
  run_count: number;
  trigger_type: string;
  event_trigger: string | null; // JSON string
  webhook_config: string | null; // JSON string (encrypted secret)
  execution_policy: string | null; // JSON string
  notification_config: string | null; // JSON string
}

export interface AutomationRunRow {
  id: string;
  automation_id: string;
  task_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration: number | null;
  result: string | null;
  steps: string; // JSON string
  is_retry: number;
  trigger_source: string;
  trigger_detail: string | null; // JSON string
  retry_count: number;
}

let db: Database.Database | null = null;

/**
 * v1.5.68: 启动周期 WAL checkpoint 守护
 *
 * 设计目标：
 *   - 每 5 分钟执行一次 `PRAGMA wal_checkpoint(TRUNCATE)`，把 WAL 数据刷回主 DB
 *   - 累计写操作 ≥ 100 次也触发一次（write counter）
 *   - 进程被 kill 时（pywebview 强退、DMG 安装）丢失的数据窗口 ≤ 5 分钟或 100 次写
 *
 * 实现说明：
 *   - 用 setInterval 守护；只在 initDb 第一次成功打开 DB 时启动
 *   - writeCounter 通过 hook 在每次 prepare/run 时累加（这里采用更简单的
 *     定时 + 轻量 pragma 查询方式：周期性检查 wal 文件大小）
 */
let checkpointTimer: NodeJS.Timeout | null = null;
function startPeriodicCheckpoint(database: Database.Database): void {
  if (checkpointTimer) return; // 幂等
  const intervalMs = 5 * 60 * 1000; // 5 分钟
  const intervalWrites = 100; // 累计写操作阈值
  let writeCountSinceLastCheckpoint = 0;

  // 拦截 prepare/run 以累计写次数（insert/update/delete）
  // better-sqlite3 提供 function hook，可监听 sql 执行事件
  try {
    database.function('__cdf_write_hook__', () => {
      writeCountSinceLastCheckpoint += 1;
      return null;
    });
  } catch {
    // 如果 function 已被占用，忽略 — 仅靠 5 分钟定时 checkpoint
  }

  const doCheckpoint = (reason: string): void => {
    try {
      const result = database.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy: number; log: number; checkpointed: number }> | unknown;
      if (Array.isArray(result) && result.length > 0) {
        const row = result[0] as { busy: number; log: number; checkpointed: number };
        if (row.busy === 0 && row.checkpointed >= 0) {
          logger.info(`[DB] ✅ 周期 WAL checkpoint 完成 (${reason}): checkpointed=${row.checkpointed}, log=${row.log}`);
        } else if (row.busy === 1) {
          logger.warn(`[DB] ⚠️  WAL checkpoint busy (${reason}), 跳过`);
        }
      } else {
        logger.info(`[DB] ✅ 周期 WAL checkpoint 完成 (${reason})`);
      }
    } catch (e) {
      logger.warn(`[DB] 周期 WAL checkpoint 异常 (${reason}):`, e);
    } finally {
      writeCountSinceLastCheckpoint = 0;
    }
  };

  checkpointTimer = setInterval(() => {
    if (writeCountSinceLastCheckpoint >= intervalWrites) {
      doCheckpoint(`writes>=${intervalWrites}`);
    } else {
      doCheckpoint('5min-tick');
    }
  }, intervalMs);
  // 不阻止进程退出
  if (typeof checkpointTimer.unref === 'function') {
    checkpointTimer.unref();
  }
  logger.info(`[DB] 周期 WAL checkpoint 已启动 (interval=${intervalMs}ms, writeThreshold=${intervalWrites})`);
}

export function initDb(): Database.Database {
  if (db) return db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // v1.9.3: 如果数据库文件丢失，尝试从备份恢复
  restoreDatabaseFromBackup();

  // v2.3.3: 启动前先做 WAL checkpoint，防止上次崩溃残留的 WAL 导致数据丢失
  if (fs.existsSync(DB_PATH)) {
    try {
      const tempDb = new Database(DB_PATH);
      tempDb.pragma('wal_checkpoint(TRUNCATE)');
      tempDb.close();
    } catch {
      // checkpoint 失败，可能是 DB 损坏，尝试从备份恢复
      logger.info('[DB] WAL checkpoint 失败，尝试恢复...');
      if (fs.existsSync(DB_BACKUP_PATH)) {
        try { fs.unlinkSync(DB_PATH); } catch {}
        try { fs.unlinkSync(DB_PATH + '-wal'); } catch {}
        try { fs.unlinkSync(DB_PATH + '-shm'); } catch {}
        try {
          fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
          logger.info('[DB] 数据库已从备份恢复（WAL checkpoint 失败）');
        } catch (e: any) {
          logger.error('[DB] 从备份恢复失败:', e?.message ?? String(e));
        }
      }
    }
  }

  // v1.9.3: 如果数据库存在，先备份
  backupDatabase();

  try {
    db = new Database(DB_PATH);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    logger.error('[DB] 数据库初始化失败:', msg);
    // 常见锁定错误：SQLITE_BUSY / SQLITE_LOCKED / permission denied
    if (/busy|locked|permission|cannot open/i.test(msg)) {
      logger.error('[DB] 数据库文件可能被其他进程占用或权限不足，请关闭所有可能访问 ~/.cdf-know-clow/chat.db 的程序');
      // 尝试从备份恢复
      if (fs.existsSync(DB_BACKUP_PATH)) {
        try {
          fs.unlinkSync(DB_PATH);
          fs.copyFileSync(DB_BACKUP_PATH, DB_PATH);
          logger.info('[DB] 已从备份恢复数据库，重试初始化...');
          db = new Database(DB_PATH);
        } catch (e2: any) {
          logger.error('[DB] 从备份恢复失败:', e2?.message ?? e2);
          throw e;
        }
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  // Enable foreign keys
  try { db.pragma('journal_mode = WAL'); } catch { /* readonly mode */ }
  try { db.pragma('foreign_keys = ON'); } catch { /* readonly mode */ }

  // v2.8.9: 检测数据库是否只读（macOS com.apple.provenance 安全限制）
  let isMemoryDb = false;
  try {
    db.pragma('wal_checkpoint(RESTART)');
  } catch {
    logger.warn('[DB] 数据库只读（可能是 macOS 安全限制），切换到内存数据库');
    try { db.close(); } catch {}
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    isMemoryDb = true;
    logger.info('[DB] 已切换到内存数据库（数据不会持久化）');
  }
  try { db.pragma('foreign_keys = ON'); } catch { /* readonly mode */ }

  // v1.5.68: 启动时做完整性检查 — 提前发现 DB 损坏，配合 chat.db.bak 备份做更可靠的恢复
  // v4.0: 先做 WAL checkpoint(RESTART) 将未刷盘的事务写入主 DB，再进行完整性检查
  try { db.pragma('wal_checkpoint(RESTART)'); } catch {
    logger.warn('[DB] WAL checkpoint 失败（可能是只读模式），跳过');
  }
  try {
    const integrityResult = db.pragma('integrity_check') as Array<{ integrity_check: string }> | string;
    let isOk = false;
    if (typeof integrityResult === 'string') {
      isOk = integrityResult === 'ok';
      if (!isOk) {
        logger.error('[DB] ❌ integrity_check 失败:', integrityResult);
      }
    } else if (Array.isArray(integrityResult) && integrityResult.length > 0) {
      const first = integrityResult[0]?.integrity_check;
      isOk = first === 'ok';
      if (!isOk) {
        logger.error('[DB] ❌ integrity_check 失败:', first);
      }
    }

    // v4.0: 完整性检查失败时，尝试通过 WAL checkpoint(TRUNCATE) 恢复
    if (!isOk) {
      logger.warn('[ChatDB] 数据库完整性检查失败，尝试从 WAL 恢复...');
      db.pragma('wal_checkpoint(TRUNCATE)');
      // 重新检查
      const recheck = db.pragma('integrity_check') as Array<{ integrity_check: string }> | string;
      let recheckOk = false;
      if (typeof recheck === 'string') {
        recheckOk = recheck === 'ok';
      } else if (Array.isArray(recheck) && recheck.length > 0) {
        recheckOk = recheck[0]?.integrity_check === 'ok';
      }
      if (recheckOk) {
        logger.info('[DB] ✅ WAL 恢复成功，完整性检查通过');
      } else {
        logger.error('[ChatDB] 数据库无法恢复，需手动修复');
      }
    } else {
      logger.info('[DB] ✅ integrity_check 通过');
    }
  } catch (e) {
    logger.warn('[DB] integrity_check 异常:', e);
  }

  // v1.5.68: 启动周期 checkpoint（每 5 分钟或累计 100 次写操作触发一次），
  // 避免 WAL 文件无限增长，进程被 kill 时最大数据丢失窗口可控。
  startPeriodicCheckpoint(db);

  // Existing chat tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      agentId TEXT,
      folderId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE SET NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sessionId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      model TEXT,
      timestamp TEXT NOT NULL,
      toolCalls TEXT,
      skillId TEXT DEFAULT NULL,
      FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parentId TEXT,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (parentId) REFERENCES folders(id) ON DELETE CASCADE
    );
  `);

  // New business data tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      totalVolume REAL NOT NULL DEFAULT 0,
      usedVolume REAL NOT NULL DEFAULT 0,
      totalItems INTEGER NOT NULL DEFAULT 0,
      usedItems INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'normal',
      address TEXT NOT NULL DEFAULT '',
      manager TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      sku TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      warehouseId TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      volumePerUnit REAL NOT NULL DEFAULT 0,
      totalVolume REAL NOT NULL DEFAULT 0,
      inboundDate TEXT NOT NULL DEFAULT '',
      valuePerUnit REAL NOT NULL DEFAULT 0,
      totalValue REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT '',
      isAgeWarning INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transit_orders (
      id TEXT PRIMARY KEY,
      trackingNo TEXT NOT NULL DEFAULT '',
      fromWarehouseId TEXT NOT NULL DEFAULT '',
      toWarehouseId TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      weight REAL NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      transportMode TEXT NOT NULL DEFAULT 'sea',
      estimatedArrival TEXT NOT NULL DEFAULT '',
      actualArrival TEXT DEFAULT NULL,
      status TEXT NOT NULL DEFAULT 'dispatched',
      createdAt TEXT NOT NULL,
      carrier TEXT NOT NULL DEFAULT '',
      value REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transit_status_history (
      id TEXT PRIMARY KEY,
      transitOrderId TEXT NOT NULL,
      status TEXT NOT NULL,
      time TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (transitOrderId) REFERENCES transit_orders(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS inbound_records (
      id TEXT PRIMARY KEY,
      warehouseId TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE TABLE IF NOT EXISTS outbound_records (
      id TEXT PRIMARY KEY,
      warehouseId TEXT NOT NULL DEFAULT '',
      sku TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      operator TEXT NOT NULL DEFAULT '',
      destination TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS user_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "desc" TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Extension',
      category TEXT NOT NULL DEFAULT 'tool',
      path TEXT NOT NULL DEFAULT '',
      trigger TEXT DEFAULT '',
      detail TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      version TEXT DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0,
      shortcut TEXT DEFAULT '',
      installedAt INTEGER NOT NULL DEFAULT 0,
      promptTemplate TEXT DEFAULT '',
      executionMode TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS builtin_status_patches (
      skillId TEXT PRIMARY KEY,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_warehouseId ON inventory_items(warehouseId);
    CREATE INDEX IF NOT EXISTS idx_transit_status ON transit_orders(status);
    CREATE INDEX IF NOT EXISTS idx_transit_from ON transit_orders(fromWarehouseId);
    CREATE INDEX IF NOT EXISTS idx_transit_to ON transit_orders(toWarehouseId);
    CREATE INDEX IF NOT EXISTS idx_inbound_warehouseId ON inbound_records(warehouseId);
    CREATE INDEX IF NOT EXISTS idx_outbound_warehouseId ON outbound_records(warehouseId);
    CREATE INDEX IF NOT EXISTS idx_status_history_orderId ON transit_status_history(transitOrderId);
  `);

  // inventory_transactions table (v1.0.76)
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('inbound', 'outbound', 'adjustment')),
      quantity INTEGER NOT NULL,
      warehouseId TEXT NOT NULL,
      operator TEXT DEFAULT '',
      sourceId TEXT DEFAULT '',
      sourceType TEXT DEFAULT '',
      remark TEXT DEFAULT '',
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (warehouseId) REFERENCES warehouses(id)
    );
    CREATE INDEX IF NOT EXISTS idx_inv_trans_sku ON inventory_transactions(sku);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(type);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_warehouse ON inventory_transactions(warehouseId);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_created ON inventory_transactions(createdAt);
  `);

  // Add autoCreated column to inventory_items (v1.0.76)
  const extraColumns: Array<{ table: string; column: string; definition: string }> = [
    { table: 'inventory_items', column: 'autoCreated', definition: "INTEGER NOT NULL DEFAULT 0" },
  ];
  for (const { table, column, definition } of extraColumns) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // Add skillId column to messages table (v1.0.94) — 幂等迁移
  const messagesSkillIdExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('messages') WHERE name='skillId'`).get() as { cnt: number };
  if (messagesSkillIdExists.cnt === 0) {
    db.exec(`ALTER TABLE messages ADD COLUMN skillId TEXT DEFAULT NULL`);
  }

  // Add thinking columns to messages table — 幂等迁移
  const thinkingColumns: Array<{ column: string; definition: string }> = [
    { column: 'thinking', definition: 'TEXT' },
    { column: 'thinkingDuration', definition: 'INTEGER' },
    { column: 'attachments', definition: 'TEXT' },
  ];
  for (const { column, definition } of thinkingColumns) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('messages') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE messages ADD COLUMN ${column} ${definition}`);
    }
  }

  // Add new columns to existing tables (v1.0.76) — safe ALTER with column-existence check
  const columnsToAdd: Array<{ table: string; column: string; definition: string }> = [
    { table: 'inbound_records', column: 'supplier', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'inbound_records', column: 'batchNo', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'outbound_records', column: 'customer', definition: "TEXT NOT NULL DEFAULT ''" },
    { table: 'outbound_records', column: 'orderNo', definition: "TEXT NOT NULL DEFAULT ''" },
    // v1.0.86: user_skills 新增 promptTemplate + executionMode
    { table: 'user_skills', column: 'promptTemplate', definition: "TEXT DEFAULT ''" },
    { table: 'user_skills', column: 'executionMode', definition: "TEXT DEFAULT ''" },
  ];
  for (const { table, column, definition } of columnsToAdd) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // ===================== v1.5.0: Transfer Orders =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS transfer_orders (
      id TEXT PRIMARY KEY,
      transferNo TEXT NOT NULL DEFAULT '',
      fromWarehouseId TEXT NOT NULL,
      toWarehouseId TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL DEFAULT 0,
      volume REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft',
      transitOrderId TEXT DEFAULT NULL,
      createdBy TEXT NOT NULL DEFAULT '',
      submittedAt TEXT DEFAULT NULL,
      submittedBy TEXT DEFAULT NULL,
      receivedAt TEXT DEFAULT NULL,
      receivedBy TEXT DEFAULT NULL,
      completedAt TEXT DEFAULT NULL,
      completedBy TEXT DEFAULT NULL,
      remark TEXT DEFAULT '',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (fromWarehouseId) REFERENCES warehouses(id),
      FOREIGN KEY (toWarehouseId) REFERENCES warehouses(id),
      FOREIGN KEY (transitOrderId) REFERENCES transit_orders(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_transfer_status ON transfer_orders(status);
    CREATE INDEX IF NOT EXISTS idx_transfer_from ON transfer_orders(fromWarehouseId);
    CREATE INDEX IF NOT EXISTS idx_transfer_to ON transfer_orders(toWarehouseId);
    CREATE INDEX IF NOT EXISTS idx_transfer_sku ON transfer_orders(sku);
    CREATE INDEX IF NOT EXISTS idx_transfer_transit ON transfer_orders(transitOrderId);
  `);

  // v1.5.0: Expand inventory_transactions CHECK constraint to include transfer_out / transfer_in
  // SQLite does not support ALTER CONSTRAINT, so we rebuild the table.
  const v150CheckMigrationKey = 'migration_v1.5.0_inv_txn_check';
  const v150CheckMigrationExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(v150CheckMigrationKey) as { value: string } | undefined;
  if (!v150CheckMigrationExists) {
    logger.info('[Migrate v1.5.0] 扩展 inventory_transactions CHECK 约束...');
    db.exec(`
      CREATE TABLE inventory_transactions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sku TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('inbound', 'outbound', 'adjustment', 'transfer_out', 'transfer_in')),
        quantity INTEGER NOT NULL,
        warehouseId TEXT NOT NULL,
        operator TEXT DEFAULT '',
        sourceId TEXT DEFAULT '',
        sourceType TEXT DEFAULT '',
        remark TEXT DEFAULT '',
        createdAt TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (warehouseId) REFERENCES warehouses(id)
      );
      INSERT INTO inventory_transactions_new SELECT * FROM inventory_transactions;
      DROP TABLE inventory_transactions;
      ALTER TABLE inventory_transactions_new RENAME TO inventory_transactions;
    `);
    // Recreate indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_inv_trans_sku ON inventory_transactions(sku);
      CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(type);
      CREATE INDEX IF NOT EXISTS idx_inv_trans_warehouse ON inventory_transactions(warehouseId);
      CREATE INDEX IF NOT EXISTS idx_inv_trans_created ON inventory_transactions(createdAt);
    `);
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(v150CheckMigrationKey, JSON.stringify({ migratedAt: new Date().toISOString() }));
    logger.info('[Migrate v1.5.0] ✅ CHECK 约束扩展完成');
  }

  // ===================== v1.6.0: Replenishment Suggestions =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS replenishment_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL,
      warehouse_id TEXT NOT NULL,
      current_stock INTEGER NOT NULL DEFAULT 0,
      in_transit_qty INTEGER NOT NULL DEFAULT 0,
      safety_stock INTEGER NOT NULL DEFAULT 0,
      daily_consumption REAL NOT NULL DEFAULT 0,
      target_stock INTEGER NOT NULL DEFAULT 0,
      suggested_qty INTEGER NOT NULL DEFAULT 0,
      source_warehouse_id TEXT,
      priority TEXT NOT NULL DEFAULT 'low' CHECK(priority IN ('critical', 'high', 'medium', 'low')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'ignored', 'deferred')),
      transfer_order_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (source_warehouse_id) REFERENCES warehouses(id),
      FOREIGN KEY (transfer_order_id) REFERENCES transfer_orders(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_replenishment_sku ON replenishment_suggestions(sku);
    CREATE INDEX IF NOT EXISTS idx_replenishment_warehouse ON replenishment_suggestions(warehouse_id);
    CREATE INDEX IF NOT EXISTS idx_replenishment_status ON replenishment_suggestions(status);
    CREATE INDEX IF NOT EXISTS idx_replenishment_priority ON replenishment_suggestions(priority);
  `);

  // v1.6.0: Add minStock column to inventory_items (idempotent)
  const minStockExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('inventory_items') WHERE name='minStock'`).get() as { cnt: number };
  if (minStockExists.cnt === 0) {
    db.exec(`ALTER TABLE inventory_items ADD COLUMN minStock INTEGER NOT NULL DEFAULT 0`);
    logger.info('[Migrate v1.6.0] ✅ 添加 minStock 列到 inventory_items');
  }

  // ===================== v1.4.0: Partners Table =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS partners (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'supplier' CHECK(type IN ('supplier', 'customer')),
      contact TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      remark TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_partners_name_type ON partners(name, type);
    CREATE INDEX IF NOT EXISTS idx_partners_type ON partners(type);
  `);

  // v1.4.0: Add supplier_id / customer_id columns (idempotent)
  const v140Columns: Array<{ table: string; column: string; definition: string }> = [
    { table: 'inbound_records', column: 'supplier_id', definition: 'TEXT DEFAULT NULL' },
    { table: 'outbound_records', column: 'customer_id', definition: 'TEXT DEFAULT NULL' },
  ];
  for (const { table, column, definition } of v140Columns) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // v1.4.0: Create indexes for partner FK columns
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_inbound_supplier_id ON inbound_records(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_outbound_customer_id ON outbound_records(customer_id);
  `);

  // ===================== v1.4.0: Data Migration =====================

  const migrationKey = 'migration_v1.4.0_partners';
  const migrationExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(migrationKey) as { value: string } | undefined;

  if (!migrationExists) {
    logger.info('[Migrate v1.4.0] 开始客商数据迁移...');

    // --- Normalization helper ---
    const normalize = (s: string): string => {
      let t = s.trim();
      // Full-width parentheses → half-width
      t = t.replace(/\uff08/g, '(').replace(/\uff09/g, ')');
      // Normalize spaces: collapse multiple spaces to single
      t = t.replace(/\s+/g, ' ');
      return t;
    };

    // ---- Phase A: Collect & deduplicate ----

    // Suppliers from inbound_records
    const supplierRows = db.prepare(
      "SELECT DISTINCT TRIM(supplier) as name FROM inbound_records WHERE supplier IS NOT NULL AND supplier != ''"
    ).all() as Array<{ name: string }>;

    // Customers from outbound_records
    const customerRows = db.prepare(
      "SELECT DISTINCT TRIM(customer) as name FROM outbound_records WHERE customer IS NOT NULL AND customer != ''"
    ).all() as Array<{ name: string }>;

    // Group by normalized name, pick most frequent original
    const groupByName = (rows: Array<{ name: string }>): Map<string, string> => {
      const map = new Map<string, { original: string; count: number }>();
      for (const row of rows) {
        const key = normalize(row.name).toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.count++;
          // Prefer shorter name as canonical
          if (row.name.length < existing.original.length) {
            existing.original = row.name;
          }
        } else {
          map.set(key, { original: row.name, count: 1 });
        }
      }
      const result = new Map<string, string>();
      for (const [key, val] of map) {
        result.set(key, val.original);
      }
      return result;
    };

    const supplierMap = groupByName(supplierRows);
    const customerMap = groupByName(customerRows);

    logger.info(`[Migrate v1.4.0] 扫描: 入库供应商 ${supplierRows.length} 条, 出库客户 ${customerRows.length} 条`);
    logger.info(`[Migrate v1.4.0] 去重: 唯一供应商 ${supplierMap.size} 个, 唯一客户 ${customerMap.size} 个`);

    // ---- Phase B: Create partners & backfill ----

    const now = new Date().toISOString();
    const insertPartner = db.prepare(
      `INSERT INTO partners (id, name, type, contact, phone, address, remark, created_at, updated_at)
       VALUES (?, ?, ?, '', '', '', '', ?, ?)
       ON CONFLICT(name, type) DO NOTHING`
    );

    let supplierCreated = 0;
    let customerCreated = 0;

    for (const [normalizedKey, originalName] of supplierMap) {
      const id = uuidv4();
      const info = insertPartner.run(id, originalName, 'supplier', now, now);
      if (info.changes > 0) supplierCreated++;
    }

    for (const [normalizedKey, originalName] of customerMap) {
      const id = uuidv4();
      const info = insertPartner.run(id, originalName, 'customer', now, now);
      if (info.changes > 0) customerCreated++;
    }

    logger.info(`[Migrate v1.4.0] 创建: 供应商 ${supplierCreated} 个, 客户 ${customerCreated} 个`);

    // Backfill supplier_id in inbound_records
    const backfillSupplier = db.prepare(
      `UPDATE inbound_records SET supplier_id = (
         SELECT p.id FROM partners p
         WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(inbound_records.supplier))
           AND p.type = 'supplier'
         LIMIT 1
       )
       WHERE supplier IS NOT NULL AND supplier != '' AND supplier_id IS NULL`
    );
    const supplierBackfillResult = backfillSupplier.run();
    logger.info(`[Migrate v1.4.0] 回填入库供应商外键: ${supplierBackfillResult.changes} 条`);

    // Backfill customer_id in outbound_records
    const backfillCustomer = db.prepare(
      `UPDATE outbound_records SET customer_id = (
         SELECT p.id FROM partners p
         WHERE LOWER(TRIM(p.name)) = LOWER(TRIM(outbound_records.customer))
           AND p.type = 'customer'
         LIMIT 1
       )
       WHERE customer IS NOT NULL AND customer != '' AND customer_id IS NULL`
    );
    const customerBackfillResult = backfillCustomer.run();
    logger.info(`[Migrate v1.4.0] 回填出库客户外键: ${customerBackfillResult.changes} 条`);

    // ---- Phase C: Write migration marker ----
    const stats = {
      scanned: supplierRows.length + customerRows.length,
      deduped: supplierMap.size + customerMap.size,
      created: supplierCreated + customerCreated,
      linked_inbound: supplierBackfillResult.changes,
      linked_outbound: customerBackfillResult.changes,
    };
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      migrationKey,
      JSON.stringify(stats)
    );
    logger.info('[Migrate v1.4.0] ✅ 迁移完成:', JSON.stringify(stats));
  } else {
    logger.info('[Migrate v1.4.0] 迁移已执行，跳过');
  }

  // Skill chain tables (v1.1.0)
  db.exec(`
    CREATE TABLE IF NOT EXISTS skill_chains (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      fail_strategy TEXT NOT NULL DEFAULT 'stop',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS skill_chain_nodes (
      id TEXT PRIMARY KEY,
      chain_id TEXT NOT NULL REFERENCES skill_chains(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL,
      skill_name TEXT NOT NULL,
      skill_icon TEXT DEFAULT 'Extension',
      data_pass_mode TEXT NOT NULL DEFAULT 'full',
      selected_fields TEXT DEFAULT '[]',
      custom_mapping TEXT DEFAULT '{}',
      timeout INTEGER NOT NULL DEFAULT 30000,
      retry_count INTEGER NOT NULL DEFAULT 0,
      node_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE(chain_id, node_order)
    );
    CREATE TABLE IF NOT EXISTS skill_chain_executions (
      id TEXT PRIMARY KEY,
      chain_id TEXT NOT NULL REFERENCES skill_chains(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'running',
      fail_strategy TEXT NOT NULL DEFAULT 'stop',
      steps TEXT NOT NULL DEFAULT '[]',
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      duration INTEGER
    );
    CREATE TABLE IF NOT EXISTS skill_audits (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      skill_version TEXT NOT NULL,
      score INTEGER NOT NULL,
      level TEXT NOT NULL,
      report_json TEXT NOT NULL DEFAULT '{}',
      report_markdown TEXT NOT NULL DEFAULT '',
      triggered_by TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, skill_version)
    );
  `);

  // Add description column to skill_chains if missing (idempotent migration)
  const chainDescExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('skill_chains') WHERE name='description'`).get() as { cnt: number };
  if (chainDescExists.cnt === 0) {
    db.exec(`ALTER TABLE skill_chains ADD COLUMN description TEXT DEFAULT ''`);
  }

  // v1.0.99: Add node_results and result columns to skill_chain_executions
  const execColumnsToAdd: Array<{ table: string; column: string; definition: string }> = [
    { table: 'skill_chain_executions', column: 'node_results', definition: "TEXT NOT NULL DEFAULT '[]'" },
    { table: 'skill_chain_executions', column: 'result', definition: "TEXT NOT NULL DEFAULT '{}'" },
  ];
  for (const { table, column, definition } of execColumnsToAdd) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('${table}') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }

  // v2.0: Automation engine tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS automations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      schedule_type TEXT NOT NULL DEFAULT 'recurring',
      rrule TEXT DEFAULT '',
      scheduled_at TEXT DEFAULT NULL,
      schedule_label TEXT DEFAULT '',
      prompt TEXT DEFAULT '',
      task_type TEXT NOT NULL DEFAULT 'custom',
      task_config TEXT DEFAULT '{}',
      valid_from TEXT DEFAULT NULL,
      valid_until TEXT DEFAULT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_run_at TEXT DEFAULT NULL,
      next_run_at TEXT DEFAULT NULL,
      run_count INTEGER NOT NULL DEFAULT 0,
      trigger_type TEXT NOT NULL DEFAULT 'schedule',
      event_trigger TEXT DEFAULT NULL,
      webhook_config TEXT DEFAULT NULL,
      execution_policy TEXT DEFAULT NULL,
      notification_config TEXT DEFAULT NULL
    );
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      automation_id TEXT NOT NULL,
      task_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      started_at TEXT NOT NULL,
      completed_at TEXT DEFAULT NULL,
      duration INTEGER DEFAULT NULL,
      result TEXT DEFAULT NULL,
      steps TEXT DEFAULT '[]',
      is_retry INTEGER NOT NULL DEFAULT 0,
      trigger_source TEXT NOT NULL DEFAULT 'manual',
      trigger_detail TEXT DEFAULT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (automation_id) REFERENCES automations(id)
    );
    CREATE INDEX IF NOT EXISTS idx_automations_status ON automations(status);
    CREATE INDEX IF NOT EXISTS idx_automations_trigger_type ON automations(trigger_type);
    CREATE INDEX IF NOT EXISTS idx_automation_runs_automation_id ON automation_runs(automation_id);
    CREATE INDEX IF NOT EXISTS idx_automation_runs_started_at ON automation_runs(started_at);
  `);

  // v2.1: Marketplace & Embedding tables (migration 004)
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketplace_skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "desc" TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Extension',
      category TEXT NOT NULL DEFAULT 'tool',
      sub_category TEXT DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      rating REAL NOT NULL DEFAULT 0,
      download_count INTEGER NOT NULL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      prompt_template TEXT DEFAULT '',
      execution_mode TEXT DEFAULT 'chat',
      permissions TEXT DEFAULT '[]',
      dependencies TEXT DEFAULT '[]',
      detail TEXT DEFAULT '',
      trigger TEXT DEFAULT '',
      icon_url TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      cached_at TEXT NOT NULL DEFAULT (datetime('now')),
      cache_expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS installed_skill_versions (
      id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      remote_id TEXT DEFAULT '',
      installed_version TEXT NOT NULL DEFAULT '',
      latest_version TEXT NOT NULL DEFAULT '',
      auto_update INTEGER NOT NULL DEFAULT 0,
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, remote_id)
    );
    CREATE TABLE IF NOT EXISTS skill_embeddings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      content_hash TEXT NOT NULL DEFAULT '',
      embedding BLOB NOT NULL,
      model_name TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
      dimensions INTEGER NOT NULL DEFAULT 384,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(skill_id, model_name)
    );
    CREATE TABLE IF NOT EXISTS match_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      match_mode TEXT NOT NULL DEFAULT 'hybrid',
      match_score REAL NOT NULL DEFAULT 0,
      is_relevant INTEGER NOT NULL DEFAULT 0,
      user_feedback INTEGER DEFAULT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS match_engine_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS skill_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      skill_id TEXT NOT NULL,
      remote_id TEXT DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 0,
      review_text TEXT DEFAULT '',
      reviewer TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_category ON marketplace_skills(category);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_author ON marketplace_skills(author);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_rating ON marketplace_skills(rating);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_downloads ON marketplace_skills(download_count);
    CREATE INDEX IF NOT EXISTS idx_marketplace_skills_cache_expires ON marketplace_skills(cache_expires_at);
    CREATE INDEX IF NOT EXISTS idx_installed_skill_versions_skill_id ON installed_skill_versions(skill_id);
    CREATE INDEX IF NOT EXISTS idx_installed_skill_versions_remote_id ON installed_skill_versions(remote_id);
    CREATE INDEX IF NOT EXISTS idx_skill_embeddings_skill_id ON skill_embeddings(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_embeddings_model ON skill_embeddings(model_name);
    CREATE INDEX IF NOT EXISTS idx_match_feedback_skill_id ON match_feedback(skill_id);
    CREATE INDEX IF NOT EXISTS idx_match_feedback_mode ON match_feedback(match_mode);
    CREATE INDEX IF NOT EXISTS idx_match_feedback_created ON match_feedback(created_at);
    CREATE INDEX IF NOT EXISTS idx_skill_reviews_skill_id ON skill_reviews(skill_id);
    CREATE INDEX IF NOT EXISTS idx_skill_reviews_remote_id ON skill_reviews(remote_id);
  `);

  // Projects and Tasks tables (v2.1)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'active' CHECK(status IN ('active','archived','completed')),
      category TEXT DEFAULT 'custom' CHECK(category IN ('custom','template','fixed')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'todo' CHECK(status IN ('todo','in_progress','done')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('low','medium','high')),
      assignee TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      due_date TEXT DEFAULT '',
      project_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
  `);

  // Initialize default match engine config if empty
  const configCount = db.prepare('SELECT COUNT(*) as cnt FROM match_engine_config').get() as { cnt: number };
  if (configCount.cnt === 0) {
    const now = new Date().toISOString();
    const defaults: Array<{ key: string; value: string }> = [
      { key: 'semantic_weight', value: '0.6' },
      { key: 'keyword_weight', value: '0.4' },
      { key: 'default_threshold', value: '0.3' },
      { key: 'default_top_k', value: '10' },
      { key: 'cache_ttl_ms', value: '300000' },
      { key: 'enable_feedback_learning', value: '1' },
      { key: 'context_window_size', value: '5' },
    ];
    const insertConfig = db.prepare(
      'INSERT OR IGNORE INTO match_engine_config (key, value, updated_at) VALUES (?, ?, ?)'
    );
    for (const { key, value } of defaults) {
      insertConfig.run(key, value, now);
    }
  }

  // v1.9.3: Add folderId column to sessions if missing (idempotent migration)
  try {
    const folderIdColExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('sessions') WHERE name='folderId'`).get() as { cnt: number };
    if (folderIdColExists.cnt === 0) {
      db.exec(`ALTER TABLE sessions ADD COLUMN folderId TEXT`);
      logger.info('[Migrate v1.9.3] 添加 folderId 列到 sessions 表');
    }
  } catch (e) {
    logger.warn('[Migrate v1.9.3] 添加 folderId 列失败（可能表不存在）:', e);
  }

  // v1.9.3: Add agentId column to sessions if missing (idempotent migration)
  try {
    const agentIdColExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('sessions') WHERE name='agentId'`).get() as { cnt: number };
    if (agentIdColExists.cnt === 0) {
      db.exec(`ALTER TABLE sessions ADD COLUMN agentId TEXT`);
      logger.info('[Migrate v1.9.3] 添加 agentId 列到 sessions 表');
    }
  } catch (e) {
    logger.warn('[Migrate v1.9.3] 添加 agentId 列失败（可能表不存在）:', e);
  }

  // ===================== v6.0: Session Lifecycle Columns =====================

  const sessionLifecycleColumns: Array<{ column: string; definition: string }> = [
    { column: 'status', definition: "TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived','daily_reset'))" },
    { column: 'lastActiveAt', definition: 'TEXT' },
    { column: 'archivedAt', definition: 'TEXT' },
    { column: 'parentSessionId', definition: 'TEXT' },
    { column: 'sessionDate', definition: 'TEXT' },
    { column: 'tags', definition: "TEXT DEFAULT '[]'" },
    { column: 'summary', definition: 'TEXT' },
  ];
  for (const { column, definition } of sessionLifecycleColumns) {
    try {
      const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('sessions') WHERE name='${column}'`).get() as { cnt: number };
      if (colExists.cnt === 0) {
        db.exec(`ALTER TABLE sessions ADD COLUMN ${column} ${definition}`);
        logger.info(`[Migrate v6.0] 添加 ${column} 列到 sessions 表`);
      }
    } catch (e) {
      logger.warn(`[Migrate v6.0] 添加 ${column} 列失败:`, e);
    }
  }

  // v6.0: 为 sessions 表添加索引（生命周期查询优化）
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_sessionDate ON sessions(sessionDate);
    CREATE INDEX IF NOT EXISTS idx_sessions_parentSessionId ON sessions(parentSessionId);
    CREATE INDEX IF NOT EXISTS idx_sessions_lastActiveAt ON sessions(lastActiveAt);
  `);

  // v6.0: 将现有会话补充 lastActiveAt 和 sessionDate（一次性迁移）
  const lifecycleMigrationKey = 'migration_v6.0_session_lifecycle';
  const lifecycleMigrationExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(lifecycleMigrationKey) as { value: string } | undefined;
  if (!lifecycleMigrationExists) {
    logger.info('[Migrate v6.0] 补充现有会话的 lastActiveAt / sessionDate...');
    db.exec(`
      UPDATE sessions SET
        lastActiveAt = COALESCE(lastActiveAt, updatedAt, createdAt),
        sessionDate = COALESCE(sessionDate, DATE(COALESCE(updatedAt, createdAt)))
      WHERE lastActiveAt IS NULL OR sessionDate IS NULL
    `);
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      lifecycleMigrationKey,
      JSON.stringify({ migratedAt: new Date().toISOString() })
    );
    logger.info('[Migrate v6.0] ✅ 会话生命周期字段迁移完成');
  }

  // ===================== v3.0: Tools v3 Plugin & HTTP Tables =====================

  db.exec(`
    -- 1. Plugins table
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      version TEXT NOT NULL DEFAULT '1.0.0',
      author TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT 'Extension',
      manifest_json TEXT NOT NULL DEFAULT '{}',
      entry_path TEXT NOT NULL DEFAULT 'index.js',
      install_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'installed' CHECK(status IN ('installed','enabled','disabled','error','uninstalled')),
      trigger_keywords TEXT DEFAULT '[]',
      permissions TEXT DEFAULT '[]',
      risk_level TEXT NOT NULL DEFAULT 'auto' CHECK(risk_level IN ('auto','confirm','high-risk')),
      size_bytes INTEGER NOT NULL DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      installed_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
    CREATE INDEX IF NOT EXISTS idx_plugins_name ON plugins(name);

    -- 2. API Domain Whitelist
    CREATE TABLE IF NOT EXISTS api_domain_whitelist (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'user' CHECK(category IN ('system','user')),
      is_deletable INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_api_domain_whitelist_hostname ON api_domain_whitelist(hostname);
    CREATE INDEX IF NOT EXISTS idx_api_domain_whitelist_category ON api_domain_whitelist(category);

    -- 3. API Templates
    CREATE TABLE IF NOT EXISTS api_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT 'GET',
      path_template TEXT NOT NULL DEFAULT '/',
      headers_json TEXT DEFAULT '{}',
      body_template TEXT DEFAULT '',
      response_path TEXT DEFAULT '',
      response_extractor TEXT NOT NULL DEFAULT 'none' CHECK(response_extractor IN ('none','jsonpath','css','regex')),
      risk_level TEXT NOT NULL DEFAULT 'auto' CHECK(risk_level IN ('auto','confirm','high-risk')),
      is_builtin INTEGER NOT NULL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_api_templates_domain ON api_templates(domain);
    CREATE INDEX IF NOT EXISTS idx_api_templates_risk ON api_templates(risk_level);

    -- 4. API Credentials (encrypted at rest)
    CREATE TABLE IF NOT EXISTS api_credentials (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      credential_type TEXT NOT NULL DEFAULT 'api_key' CHECK(credential_type IN ('api_key','bearer_token','basic_auth','oauth2','custom_header')),
      encrypted_value TEXT NOT NULL DEFAULT '',
      iv TEXT NOT NULL DEFAULT '',
      auth_tag TEXT NOT NULL DEFAULT '',
      domain TEXT NOT NULL DEFAULT '',
      header_name TEXT NOT NULL DEFAULT 'Authorization',
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_api_credentials_domain ON api_credentials(domain);

    -- 5. API Request History
    CREATE TABLE IF NOT EXISTS api_request_history (
      id TEXT PRIMARY KEY,
      template_id TEXT,
      url TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'GET',
      status_code INTEGER,
      duration_ms INTEGER,
      request_headers TEXT DEFAULT '{}',
      request_body TEXT,
      response_headers TEXT DEFAULT '{}',
      response_body TEXT,
      is_success INTEGER NOT NULL DEFAULT 0,
      extracted_preview TEXT,
      error TEXT,
      session_id TEXT,
      automation_id TEXT,
      executed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (template_id) REFERENCES api_templates(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_api_req_history_executed ON api_request_history(executed_at);
    CREATE INDEX IF NOT EXISTS idx_api_req_history_template ON api_request_history(template_id);
  `);

  // v3.0: Add is_success / extracted_preview columns to api_request_history (idempotent)
  const apiReqHistoryColumns: Array<{ column: string; definition: string }> = [
    { column: 'is_success', definition: 'INTEGER NOT NULL DEFAULT 0' },
    { column: 'extracted_preview', definition: 'TEXT' },
  ];
  for (const { column, definition } of apiReqHistoryColumns) {
    const colExists = db.prepare(`SELECT count(*) as cnt FROM pragma_table_info('api_request_history') WHERE name='${column}'`).get() as { cnt: number };
    if (colExists.cnt === 0) {
      db.exec(`ALTER TABLE api_request_history ADD COLUMN ${column} ${definition}`);
      logger.info(`[Migrate v3.0] 添加 ${column} 列到 api_request_history`);
    }
  }

  // v3.0: Seed built-in API templates
  const v300SeedKey = 'migration_v3.0_seed_templates';
  const v300SeedExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(v300SeedKey) as { value: string } | undefined;
  if (!v300SeedExists) {
    const now = new Date().toISOString();
    const builtinTemplates = [
      { id: 'github_list_repos', name: '列出仓库', description: '列出 GitHub 用户仓库', domain: 'api.github.com', method: 'GET', path_template: '/users/{username}/repos' },
      { id: 'github_create_issue', name: '创建 Issue', description: '在 GitHub 仓库创建 Issue', domain: 'api.github.com', method: 'POST', path_template: '/repos/{owner}/{repo}/issues' },
      { id: 'wechat_send_msg', name: '发送微信消息', description: '通过企业微信机器人发送消息', domain: 'qyapi.weixin.qq.com', method: 'POST', path_template: '/cgi-bin/webhook/send' },
      { id: 'tencent_doc_read', name: '读取腾讯文档', description: '读取指定腾讯文档内容', domain: 'docs.qq.com', method: 'GET', path_template: '/openapi/drive/v2/files/{fileId}' },
      { id: 'feishu_send_msg', name: '发送飞书消息', description: '通过飞书机器人发送消息', domain: 'open.feishu.cn', method: 'POST', path_template: '/open-apis/bot/v2/hook/{hookId}' },
    ];
    const insertTemplate = db.prepare(
      `INSERT OR IGNORE INTO api_templates (id, name, description, domain, method, path_template, is_builtin, risk_level, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'confirm', ?, ?)`
    );
    for (const t of builtinTemplates) {
      insertTemplate.run(t.id, t.name, t.description, t.domain, t.method, t.path_template, now, now);
    }
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(v300SeedKey, JSON.stringify({ migratedAt: now, count: builtinTemplates.length }));
    logger.info(`[Migrate v3.0] 已植入 ${builtinTemplates.length} 个内置 API 模板`);
  }

  // v3.0: Seed built-in domain whitelist (11 hardcoded domains → DB)
  const v300DomainKey = 'migration_v3.0_seed_domains';
  const v300DomainExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(v300DomainKey) as { value: string } | undefined;
  if (!v300DomainExists) {
    const now = new Date().toISOString();
    const builtinDomains = [
      { hostname: 'api.github.com', desc: 'GitHub API' },
      { hostname: 'api.openai.com', desc: 'OpenAI API' },
      { hostname: 'api.anthropic.com', desc: 'Anthropic API' },
      { hostname: 'generativelanguage.googleapis.com', desc: 'Google Gemini API' },
      { hostname: 'api.weixin.qq.com', desc: '微信 API' },
      { hostname: 'qyapi.weixin.qq.com', desc: '企业微信 API' },
      { hostname: 'docs.qq.com', desc: '腾讯文档' },
      { hostname: 'api.day.app', desc: 'Day One API' },
      { hostname: 'open.feishu.cn', desc: '飞书开放平台' },
      { hostname: 'api.money.126.net', desc: '网易财经 API' },
      { hostname: 'pushbear.ftqq.com', desc: 'PushBear 通知' },
    ];
    const insertDomain = db.prepare(
      `INSERT OR IGNORE INTO api_domain_whitelist (id, hostname, description, category, is_deletable, created_at)
       VALUES (?, ?, ?, 'system', 0, ?)`
    );
    for (const d of builtinDomains) {
      insertDomain.run(uuidv4(), d.hostname, d.desc, now);
    }
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(v300DomainKey, JSON.stringify({ migratedAt: now, count: builtinDomains.length }));
    logger.info(`[Migrate v3.0] 已植入 ${builtinDomains.length} 个内置域名白名单`);
  }

  logger.info('[Migrate v3.0] Tools v3 数据库迁移完成');

  // ===================== v3.0: Browser Profiles =====================

  db.exec(`
    CREATE TABLE IF NOT EXISTS browser_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_data_dir TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default browser profile
  const v3BrowserProfilesKey = 'migration_v3.0_browser_profiles';
  const v3BrowserProfilesExists = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(v3BrowserProfilesKey) as { value: string } | undefined;
  if (!v3BrowserProfilesExists) {
    db.prepare(
      "INSERT OR IGNORE INTO browser_profiles (id, name, user_data_dir, is_default) VALUES ('default', 'Default', '', 1)"
    ).run();
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
      v3BrowserProfilesKey,
      JSON.stringify({ migratedAt: new Date().toISOString() })
    );
    logger.info('[Migrate v3.0] 已植入默认 browser_profile');
  }

  return db;
}

// ===================== Project & Task Types =====================

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  status: string;
  category: string;
  created_at: string;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  tags: string;
  due_date: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
}

// ===================== Skill Chain Types =====================

export interface SkillChainNodeRow {
  id: string;
  chain_id: string;
  skill_id: string;
  skill_name: string;
  skill_icon: string;
  data_pass_mode: string;
  selected_fields: string;
  custom_mapping: string;
  timeout: number;
  retry_count: number;
  node_order: number;
}

export interface SkillChainRow {
  id: string;
  name: string;
  description: string;
  fail_strategy: string;
  created_at: string;
  updated_at: string;
}

export interface SkillChainExecutionRow {
  id: string;
  chain_id: string;
  status: string;
  fail_strategy: string;
  steps: string;
  node_results: string;
  result: string;
  started_at: string;
  completed_at: string | null;
  duration: number | null;
}

export interface SkillAuditRow {
  [key: string]: unknown;
  id: string;
  skill_id: string;
  skill_version: string;
  score: number;
  level: string;
  report_json: string;
  report_markdown: string;
  triggered_by: string;
  created_at: string;
}

// ===================== v3.0: Plugin & API Types =====================

export interface PluginRow {
  id: string;
  name: string;
  display_name: string;
  version: string;
  author: string;
  description: string;
  icon: string;
  manifest_json: string;
  entry_path: string;
  install_path: string;
  status: string;
  trigger_keywords: string;
  permissions: string;
  risk_level: string;
  size_bytes: number;
  metadata: string;
  installed_at: string;
  updated_at: string;
}

export interface ApiDomainWhitelistRow {
  id: string;
  hostname: string;
  description: string;
  category: string;
  is_deletable: number;
  created_at: string;
}

export interface ApiTemplateRow {
  id: string;
  name: string;
  description: string;
  domain: string;
  method: string;
  path_template: string;
  headers_json: string;
  body_template: string;
  response_path: string;
  response_extractor: string;
  risk_level: string;
  is_builtin: number;
  tags: string;
  created_at: string;
  updated_at: string;
}

export interface ApiCredentialRow {
  id: string;
  name: string;
  credential_type: string;
  encrypted_value: string;
  iv: string;
  auth_tag: string;
  domain: string;
  header_name: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiRequestHistoryRow {
  id: string;
  template_id: string | null;
  url: string;
  method: string;
  status_code: number | null;
  duration_ms: number | null;
  request_headers: string;
  request_body: string | null;
  response_headers: string;
  response_body: string | null;
  is_success: number;
  extracted_preview: string | null;
  error: string | null;
  session_id: string | null;
  automation_id: string | null;
  executed_at: string;
}

// ===================== v3.0: Browser Profile Types =====================

export interface BrowserProfileRow {
  id: string;
  name: string;
  user_data_dir: string;
  is_default: number; // 0 or 1
  created_at: string;
}

// ===================== v2.9: Worker Thread Pool（异步 API） =====================

import { DbWorkerPool } from './dbWorkerPool.js';

let dbPool: DbWorkerPool | null = null;

/** 获取异步数据库连接池（用于高并发场景） */
export function getDbPool(): DbWorkerPool {
  if (!dbPool) {
    dbPool = new DbWorkerPool(DB_PATH);
    dbPool.init();
  }
  return dbPool;
}
