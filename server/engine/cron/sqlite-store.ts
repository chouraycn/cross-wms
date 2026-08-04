/**
 * SQLite Cron Job Store
 *
 * P0-①: 统一调度系统 — 将 cron 任务持久化从 JSON 文件迁移到 SQLite，
 * 与 WMS Automation 共享同一数据库，消除双存储不一致问题。
 *
 * 兼容：实现 CronJobStore 接口，可无缝替换 JsonCronJobStore。
 * 迁移策略：首次加载时如果 SQLite 表为空但 JSON 文件存在，自动导入。
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { CronJob, CronStoreFile, CronJobState } from "./types.js";
import type { CronJobStore, LoadedCronStore, CronQuarantineFile } from "./store.js";
import { JsonCronJobStore, resolveCronStorePath, type CronQuarantineEntry } from "./store.js";

/** SQLite 存储选项 */
export interface SqliteCronJobStoreOptions {
  /** SQLite 数据库路径，默认使用 cdfknow cron 数据库 */
  dbPath?: string;
  /** store_key 用于隔离不同工作区（默认 'default'） */
  storeKey?: string;
}

/** 默认 SQLite 数据库路径 */
function resolveDefaultDbPath(): string {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  const configDir = path.join(homeDir, ".config", "cdfknow");
  return path.join(configDir, "cron.db");
}

/** 从 CronJob 提取 schedule 字段（用于 SQL 列映射） */
function extractScheduleColumns(job: CronJob): Record<string, string | number | null> {
  const s = job.schedule;
  switch (s.kind) {
    case "cron":
      return {
        schedule_kind: "cron",
        schedule_expr: s.expr,
        schedule_tz: s.tz ?? null,
        every_ms: null,
        anchor_ms: null,
        at: null,
        stagger_ms: s.staggerMs ?? null,
      };
    case "every":
      return {
        schedule_kind: "every",
        schedule_expr: null,
        schedule_tz: null,
        every_ms: s.everyMs,
        anchor_ms: s.anchorMs ?? null,
        at: null,
        stagger_ms: null,
      };
    case "at":
      return {
        schedule_kind: "at",
        schedule_expr: null,
        schedule_tz: null,
        every_ms: null,
        anchor_ms: null,
        at: typeof s.at === "string" ? s.at : String(s.at),
        stagger_ms: null,
      };
    default:
      return {
        schedule_kind: "cron",
        schedule_expr: "* * * * *",
        schedule_tz: null,
        every_ms: null,
        anchor_ms: null,
        at: null,
        stagger_ms: null,
      };
  }
}

/** 从 SQL 行重建 CronJob */
function rowToCronJob(row: Record<string, unknown>): CronJob {
  const jobJson = row.job_json as string;
  const stateJson = row.state_json as string;

  // 优先从 job_json 恢复完整对象
  const base = JSON.parse(jobJson) as CronJob;

  // 合并 SQL 列中的运行时状态（优先使用 SQL 列值）
  const state: CronJobState = stateJson ? JSON.parse(stateJson) : {};
  if (typeof row.next_run_at_ms === "number") state.nextRunAtMs = row.next_run_at_ms as number;
  if (typeof row.last_run_at_ms === "number") state.lastRunAtMs = row.last_run_at_ms as number;
  if (typeof row.last_run_status === "string") state.lastRunStatus = row.last_run_status as CronJobState["lastRunStatus"];
  if (typeof row.last_error === "string") state.lastError = row.last_error as string;
  if (typeof row.consecutive_errors === "number") state.consecutiveErrors = row.consecutive_errors as number;

  base.state = state;
  return base;
}

export class SqliteCronJobStore implements CronJobStore {
  private readonly db: Database.Database;
  private readonly storeKey: string;
  private readonly jsonStore: JsonCronJobStore;
  private migrated = false;

  constructor(options: SqliteCronJobStoreOptions = {}) {
    const dbPath = options.dbPath ?? resolveDefaultDbPath();
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.storeKey = options.storeKey ?? "default";
    this.jsonStore = new JsonCronJobStore();

    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        store_key TEXT NOT NULL,
        job_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER NOT NULL,
        delete_after_run INTEGER,
        created_at_ms INTEGER NOT NULL,
        agent_id TEXT,
        session_key TEXT,
        schedule_kind TEXT NOT NULL,
        schedule_expr TEXT,
        schedule_tz TEXT,
        every_ms INTEGER,
        anchor_ms INTEGER,
        at TEXT,
        stagger_ms INTEGER,
        session_target TEXT NOT NULL,
        wake_mode TEXT NOT NULL,
        payload_kind TEXT NOT NULL,
        payload_message TEXT,
        next_run_at_ms INTEGER,
        running_at_ms INTEGER,
        last_run_at_ms INTEGER,
        last_run_status TEXT,
        last_error TEXT,
        last_duration_ms INTEGER,
        consecutive_errors INTEGER DEFAULT 0,
        consecutive_skipped INTEGER DEFAULT 0,
        schedule_error_count INTEGER DEFAULT 0,
        last_delivery_status TEXT,
        last_delivery_error TEXT,
        last_delivered INTEGER,
        last_failure_alert_at_ms INTEGER,
        job_json TEXT NOT NULL,
        state_json TEXT NOT NULL DEFAULT '{}',
        sort_order INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (store_key, job_id)
      );

      CREATE INDEX IF NOT EXISTS idx_cron_jobs_store_updated
        ON cron_jobs(store_key, sort_order ASC, updated_at DESC, job_id);

      CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled_next_run
        ON cron_jobs(store_key, enabled, next_run_at_ms, job_id);

      CREATE INDEX IF NOT EXISTS idx_cron_jobs_agent_session
        ON cron_jobs(agent_id, session_key, updated_at DESC, job_id);
    `);
  }

  getStorePath(): string {
    return this.db.name;
  }

  getQuarantinePath(): string {
    return this.jsonStore.getQuarantinePath();
  }

  /** 从 JSON 文件迁移到 SQLite（仅首次加载时执行一次） */
  private async migrateFromJson(): Promise<void> {
    if (this.migrated) return;
    this.migrated = true;

    // 检查 SQLite 是否已有数据
    const count = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM cron_jobs WHERE store_key = ?"
    ).get(this.storeKey) as { cnt: number };

    if (count.cnt > 0) return;

    // 检查 JSON 文件是否存在
    const jsonPath = resolveCronStorePath();
    if (!fs.existsSync(jsonPath)) return;

    try {
      const { store } = await this.jsonStore.load();
      if (store.jobs.length === 0) return;

      console.log(`[SqliteCronJobStore] 从 JSON 迁移 ${store.jobs.length} 个任务到 SQLite`);

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO cron_jobs (
          store_key, job_id, name, description, enabled, delete_after_run,
          created_at_ms, agent_id, session_key,
          schedule_kind, schedule_expr, schedule_tz, every_ms, anchor_ms, at, stagger_ms,
          session_target, wake_mode, payload_kind, payload_message,
          next_run_at_ms, running_at_ms, last_run_at_ms, last_run_status,
          last_error, last_duration_ms, consecutive_errors, consecutive_skipped,
          schedule_error_count, last_delivery_status, last_delivery_error,
          last_delivered, last_failure_alert_at_ms,
          job_json, state_json, sort_order, updated_at
        ) VALUES (
          @store_key, @job_id, @name, @description, @enabled, @delete_after_run,
          @created_at_ms, @agent_id, @session_key,
          @schedule_kind, @schedule_expr, @schedule_tz, @every_ms, @anchor_ms, @at, @stagger_ms,
          @session_target, @wake_mode, @payload_kind, @payload_message,
          @next_run_at_ms, @running_at_ms, @last_run_at_ms, @last_run_status,
          @last_error, @last_duration_ms, @consecutive_errors, @consecutive_skipped,
          @schedule_error_count, @last_delivery_status, @last_delivery_error,
          @last_delivered, @last_failure_alert_at_ms,
          @job_json, @state_json, @sort_order, @updated_at
        )
      `);

      const tx = this.db.transaction((jobs: CronJob[]) => {
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          const cols = extractScheduleColumns(job);
          const state = job.state ?? {};

          insertStmt.run({
            store_key: this.storeKey,
            job_id: job.id,
            name: job.name,
            description: job.description ?? null,
            enabled: job.enabled ? 1 : 0,
            delete_after_run: job.deleteAfterRun ? 1 : null,
            created_at_ms: job.createdAtMs,
            agent_id: job.agentId ?? null,
            session_key: job.sessionKey ?? null,
            ...cols,
            session_target: job.sessionTarget,
            wake_mode: job.wakeMode,
            payload_kind: job.payload.kind,
            payload_message: "message" in job.payload ? job.payload.message : null,
            next_run_at_ms: state.nextRunAtMs ?? null,
            running_at_ms: state.runningAtMs ?? null,
            last_run_at_ms: state.lastRunAtMs ?? null,
            last_run_status: state.lastRunStatus ?? null,
            last_error: state.lastError ?? null,
            last_duration_ms: state.lastDurationMs ?? null,
            consecutive_errors: state.consecutiveErrors ?? 0,
            consecutive_skipped: state.consecutiveSkipped ?? 0,
            schedule_error_count: state.scheduleErrorCount ?? 0,
            last_delivery_status: state.lastDeliveryStatus ?? null,
            last_delivery_error: state.lastDeliveryError ?? null,
            last_delivered: state.lastDelivered ? 1 : 0,
            last_failure_alert_at_ms: state.lastFailureAlertAtMs ?? null,
            job_json: JSON.stringify(job),
            state_json: JSON.stringify(state),
            sort_order: i,
            updated_at: job.updatedAtMs,
          });
        }
      });

      tx(store.jobs);
      console.log(`[SqliteCronJobStore] 迁移完成`);
    } catch (err) {
      console.warn(`[SqliteCronJobStore] JSON 迁移失败，将继续使用空存储:`, err);
    }
  }

  async load(): Promise<LoadedCronStore> {
    await this.migrateFromJson();

    const rows = this.db.prepare(
      "SELECT * FROM cron_jobs WHERE store_key = ? ORDER BY sort_order ASC, updated_at DESC"
    ).all(this.storeKey) as Record<string, unknown>[];

    const jobs: CronJob[] = rows.map(rowToCronJob);

    // 隔离文件仍使用 JSON 存储（频率低，无需迁移）
    const quarantineJobs = await this.loadQuarantine();

    return {
      store: { version: 1, jobs },
      quarantineJobs: quarantineJobs.jobs,
      invalidConfigRows: [],
    };
  }

  async save(store: CronStoreFile): Promise<void> {
    const tx = this.db.transaction((jobs: CronJob[]) => {
      // 先删除当前 store_key 下的所有任务
      this.db.prepare("DELETE FROM cron_jobs WHERE store_key = ?").run(this.storeKey);

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO cron_jobs (
          store_key, job_id, name, description, enabled, delete_after_run,
          created_at_ms, agent_id, session_key,
          schedule_kind, schedule_expr, schedule_tz, every_ms, anchor_ms, at, stagger_ms,
          session_target, wake_mode, payload_kind, payload_message,
          next_run_at_ms, running_at_ms, last_run_at_ms, last_run_status,
          last_error, last_duration_ms, consecutive_errors, consecutive_skipped,
          schedule_error_count, last_delivery_status, last_delivery_error,
          last_delivered, last_failure_alert_at_ms,
          job_json, state_json, sort_order, updated_at
        ) VALUES (
          @store_key, @job_id, @name, @description, @enabled, @delete_after_run,
          @created_at_ms, @agent_id, @session_key,
          @schedule_kind, @schedule_expr, @schedule_tz, @every_ms, @anchor_ms, @at, @stagger_ms,
          @session_target, @wake_mode, @payload_kind, @payload_message,
          @next_run_at_ms, @running_at_ms, @last_run_at_ms, @last_run_status,
          @last_error, @last_duration_ms, @consecutive_errors, @consecutive_skipped,
          @schedule_error_count, @last_delivery_status, @last_delivery_error,
          @last_delivered, @last_failure_alert_at_ms,
          @job_json, @state_json, @sort_order, @updated_at
        )
      `);

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const cols = extractScheduleColumns(job);
        const state = job.state ?? {};

        insertStmt.run({
          store_key: this.storeKey,
          job_id: job.id,
          name: job.name,
          description: job.description ?? null,
          enabled: job.enabled ? 1 : 0,
          delete_after_run: job.deleteAfterRun ? 1 : null,
          created_at_ms: job.createdAtMs,
          agent_id: job.agentId ?? null,
          session_key: job.sessionKey ?? null,
          ...cols,
          session_target: job.sessionTarget,
          wake_mode: job.wakeMode,
          payload_kind: job.payload.kind,
          payload_message: "message" in job.payload ? job.payload.message : null,
          next_run_at_ms: state.nextRunAtMs ?? null,
          running_at_ms: state.runningAtMs ?? null,
          last_run_at_ms: state.lastRunAtMs ?? null,
          last_run_status: state.lastRunStatus ?? null,
          last_error: state.lastError ?? null,
          last_duration_ms: state.lastDurationMs ?? null,
          consecutive_errors: state.consecutiveErrors ?? 0,
          consecutive_skipped: state.consecutiveSkipped ?? 0,
          schedule_error_count: state.scheduleErrorCount ?? 0,
          last_delivery_status: state.lastDeliveryStatus ?? null,
          last_delivery_error: state.lastDeliveryError ?? null,
          last_delivered: state.lastDelivered ? 1 : 0,
          last_failure_alert_at_ms: state.lastFailureAlertAtMs ?? null,
          job_json: JSON.stringify(job),
          state_json: JSON.stringify(state),
          sort_order: i,
          updated_at: job.updatedAtMs,
        });
      }
    });

    tx(store.jobs);
  }

  async loadQuarantine(): Promise<CronQuarantineFile> {
    return this.jsonStore.loadQuarantine();
  }

  async saveQuarantine(quarantine: CronQuarantineFile): Promise<void> {
    return this.jsonStore.saveQuarantine(quarantine);
  }

  /** 关闭数据库连接 */
  close(): void {
    this.db.close();
  }
}

/** 默认 SQLite 存储实例 */
let defaultSqliteStore: SqliteCronJobStore | null = null;

/** 获取默认 SQLite 存储实例 */
export function getDefaultSqliteCronStore(): SqliteCronJobStore {
  if (!defaultSqliteStore) {
    defaultSqliteStore = new SqliteCronJobStore();
  }
  return defaultSqliteStore;
}

/** 设置默认 SQLite 存储实例（用于测试） */
export function setDefaultSqliteCronStore(store: SqliteCronJobStore): void {
  defaultSqliteStore = store;
}
