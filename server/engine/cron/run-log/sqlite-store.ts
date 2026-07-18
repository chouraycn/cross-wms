import Database from "better-sqlite3";
import type { CronRunLogEntry, GetCronRunHistoryOptions, CronRunHistoryPage } from "./index.js";
import { encodeCronRunLogEntry, decodeCronRunLogEntry } from "./entry-codec.js";

interface SqliteCronRunLogStoreOptions {
  dbPath?: string;
  maxEntriesPerJob?: number;
  maxTotalEntries?: number;
}

const DEFAULT_MAX_ENTRIES_PER_JOB = 2000;
const DEFAULT_MAX_TOTAL_ENTRIES = 50000;

export class SqliteCronRunLogStore {
  private readonly db: Database.Database;
  private readonly maxEntriesPerJob: number;
  private readonly maxTotalEntries: number;

  constructor(options: SqliteCronRunLogStoreOptions = {}) {
    this.db = new Database(options.dbPath ?? ":memory:");
    this.maxEntriesPerJob = options.maxEntriesPerJob ?? DEFAULT_MAX_ENTRIES_PER_JOB;
    this.maxTotalEntries = options.maxTotalEntries ?? DEFAULT_MAX_TOTAL_ENTRIES;

    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_run_log (
        runId TEXT PRIMARY KEY,
        jobId TEXT NOT NULL,
        jobName TEXT,
        startTime INTEGER NOT NULL,
        endTime INTEGER,
        durationMs INTEGER,
        status TEXT NOT NULL,
        error TEXT,
        errorReason TEXT,
        summary TEXT,
        deliveryStatus TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_cron_run_log_jobId ON cron_run_log(jobId);
      CREATE INDEX IF NOT EXISTS idx_cron_run_log_startTime ON cron_run_log(startTime);
      CREATE INDEX IF NOT EXISTS idx_cron_run_log_status ON cron_run_log(status);
    `);
  }

  record(entry: CronRunLogEntry): CronRunLogEntry {
    const encoded = encodeCronRunLogEntry(entry);

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cron_run_log (
        runId, jobId, jobName, startTime, endTime, durationMs,
        status, error, errorReason, summary, deliveryStatus
      ) VALUES (
        @runId, @jobId, @jobName, @startTime, @endTime, @durationMs,
        @status, @error, @errorReason, @summary, @deliveryStatus
      )
    `);

    stmt.run(encoded);

    this.trim();

    return entry;
  }

  private trim(): void {
    this.trimPerJob();
    this.trimGlobal();
  }

  private trimPerJob(): void {
    const stmt = this.db.prepare(`
      DELETE FROM cron_run_log
      WHERE runId IN (
        SELECT runId FROM cron_run_log
        WHERE jobId = ?
        ORDER BY startTime DESC
        LIMIT -1 OFFSET ?
      )
    `);

    const jobIds = this.db.prepare("SELECT DISTINCT jobId FROM cron_run_log").all() as { jobId: string }[];

    for (const { jobId } of jobIds) {
      stmt.run(jobId, this.maxEntriesPerJob);
    }
  }

  private trimGlobal(): void {
    const stmt = this.db.prepare(`
      DELETE FROM cron_run_log
      WHERE runId IN (
        SELECT runId FROM cron_run_log
        ORDER BY startTime DESC
        LIMIT -1 OFFSET ?
      )
    `);

    stmt.run(this.maxTotalEntries);
  }

  getHistory(options: GetCronRunHistoryOptions = {}): CronRunLogEntry[] {
    const page = this.getHistoryPage(options);
    return page.entries;
  }

  getHistoryPage(options: GetCronRunHistoryOptions = {}): CronRunHistoryPage {
    const limit = Math.max(1, Math.min(200, Math.floor(options.limit ?? 50)));
    const offset = Math.max(0, Math.floor(options.offset ?? 0));
    const sortDir = options.sortDir === "asc" ? "ASC" : "DESC";

    let whereClause = "";
    const params: unknown[] = [];

    if (options.jobId) {
      whereClause += ` AND jobId = ?`;
      params.push(options.jobId);
    }

    if (options.runId) {
      whereClause += ` AND runId = ?`;
      params.push(options.runId);
    }

    if (options.status && options.status !== "all") {
      whereClause += ` AND status = ?`;
      params.push(options.status);
    }

    if (options.statuses && options.statuses.length > 0) {
      const placeholders = options.statuses.map(() => "?").join(",");
      whereClause += ` AND status IN (${placeholders})`;
      params.push(...options.statuses);
    }

    if (options.query) {
      const query = `%${options.query.toLowerCase()}%`;
      whereClause += ` AND (LOWER(summary) LIKE ? OR LOWER(error) LIKE ? OR LOWER(jobName) LIKE ? OR LOWER(jobId) LIKE ?)`;
      params.push(query, query, query, query);
    }

    const baseQuery = `SELECT * FROM cron_run_log WHERE 1=1${whereClause}`;

    const countStmt = this.db.prepare(`SELECT COUNT(*) as total FROM cron_run_log WHERE 1=1${whereClause}`);
    const countResult = countStmt.get(...params) as { total: number };
    const total = countResult.total;

    const queryStmt = this.db.prepare(`${baseQuery} ORDER BY startTime ${sortDir} LIMIT ? OFFSET ?`);
    params.push(limit, offset);

    const rows = queryStmt.all(...params) as Record<string, unknown>[];
    const entries = rows.map((row) => decodeCronRunLogEntry(row)).filter((e): e is CronRunLogEntry => e !== null);

    const boundedOffset = Math.min(total, offset);
    const nextOffset = boundedOffset + entries.length;

    return {
      entries,
      total,
      offset: boundedOffset,
      limit,
      hasMore: nextOffset < total,
      nextOffset: nextOffset < total ? nextOffset : null,
    };
  }

  getEntry(runId: string): CronRunLogEntry | undefined {
    const stmt = this.db.prepare("SELECT * FROM cron_run_log WHERE runId = ?");
    const row = stmt.get(runId) as Record<string, unknown> | undefined;

    if (!row) {
      return undefined;
    }

    const decoded = decodeCronRunLogEntry(row);
    return decoded ?? undefined;
  }

  getSize(): number {
    const stmt = this.db.prepare("SELECT COUNT(*) as count FROM cron_run_log");
    const result = stmt.get() as { count: number };
    return result.count;
  }

  clear(): void {
    this.db.exec("DELETE FROM cron_run_log");
  }

  close(): void {
    this.db.close();
  }
}