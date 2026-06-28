/**
 * Cron Store - 持久化存储
 * 基于 JSON 文件的 cron job 存储实现，支持原子写入和隔离文件处理
 */

import fs from "node:fs";
import path from "node:path";

/** Cron 任务配置 */
export interface CronJobConfig {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  taskType: string;
  taskParams: Record<string, unknown>;
  sessionKey?: string;
  agent?: string;
  timezone?: string;
  enabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  staggerMs?: number;
  metadata?: Record<string, unknown>;
}

/** Cron 任务运行时状态 */
export interface CronJobRuntime {
  status: "active" | "paused" | "completed" | "failed" | "disabled";
  lastRunAt?: number;
  nextRunAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  consecutiveFailures: number;
  totalRuns: number;
  totalSuccesses: number;
  totalFailures: number;
  createdAt: number;
  updatedAt: number;
}

/** 完整的 Cron Job 条目 */
export interface CronJobEntry extends CronJobConfig, CronJobRuntime {}

/** 存储文件格式 */
export interface CronStoreFile {
  version: number;
  jobs: CronJobEntry[];
}

/** 隔离文件格式（用于存储无效或异常的 job） */
export interface CronQuarantineFile {
  version: number;
  jobs: CronQuarantineEntry[];
}

/** 隔离条目 */
export interface CronQuarantineEntry {
  quarantinedAtMs: number;
  sourceIndex: number;
  reason: string;
  job?: CronJobConfig;
  raw?: string;
  state?: CronJobRuntime;
  updatedAtMs?: number;
  scheduleIdentity?: string;
}

/** 加载的存储数据 */
export interface LoadedCronStore {
  store: CronStoreFile;
  quarantineJobs: CronQuarantineEntry[];
  invalidConfigRows: CronQuarantineEntry[];
}

/** Cron Store 接口 */
export interface CronJobStore {
  /** 加载存储数据 */
  load(): Promise<LoadedCronStore>;
  /** 保存存储数据 */
  save(store: CronStoreFile): Promise<void>;
  /** 加载隔离文件 */
  loadQuarantine(): Promise<CronQuarantineFile>;
  /** 保存隔离文件 */
  saveQuarantine(quarantine: CronQuarantineFile): Promise<void>;
  /** 获取存储路径 */
  getStorePath(): string;
  /** 获取隔离文件路径 */
  getQuarantinePath(): string;
}

/** 默认的 cron 存储目录名 */
const DEFAULT_CRON_DIR = "cron";

/** 默认的存储文件名 */
const DEFAULT_STORE_FILENAME = "jobs.json";

/** 隔离文件名后缀 */
const QUARANTINE_SUFFIX = "-quarantine.json";

/** 解析默认的 cron 存储目录 */
function resolveDefaultCronDir(): string {
  const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return path.join(homeDir, ".config", "cross-wms", DEFAULT_CRON_DIR);
}

/** 解析默认的存储文件路径 */
function resolveDefaultStorePath(): string {
  return path.join(resolveDefaultCronDir(), DEFAULT_STORE_FILENAME);
}

/** 解析隔离文件路径 */
export function resolveQuarantinePath(storePath: string): string {
  if (storePath.endsWith(".json")) {
    return storePath.replace(/\.json$/, QUARANTINE_SUFFIX);
  }
  return `${storePath}${QUARANTINE_SUFFIX}`;
}

/** 展开 home 目录前缀 */
function expandHomePrefix(rawPath: string): string {
  if (rawPath.startsWith("~/") || rawPath === "~") {
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? "";
    return rawPath.replace(/^~/, homeDir);
  }
  return rawPath;
}

/** 解析存储文件路径 */
export function resolveCronStorePath(storePath?: string): string {
  if (storePath?.trim()) {
    const raw = storePath.trim();
    if (raw.startsWith("~")) {
      return path.resolve(expandHomePrefix(raw));
    }
    return path.resolve(raw);
  }
  return resolveDefaultStorePath();
}

/** 原子写入文件 */
async function atomicWrite(
  filePath: string,
  content: string,
  dirMode = 0o700,
  fileMode = 0o600,
): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;

  // 确保目录存在
  await fs.promises.mkdir(dir, { recursive: true, mode: dirMode });

  // 写入临时文件
  await fs.promises.writeFile(tempPath, content, { mode: fileMode });

  // 重命名到目标文件（原子操作）
  try {
    await fs.promises.rename(tempPath, filePath);
  } catch (err) {
    // 如果重命名失败，尝试删除临时文件
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

/** 解析 JSON 文件，支持注释 */
function parseJsonWithComments(raw: string): unknown {
  // 移除单行注释
  const cleaned = raw.replace(/\/\/.*$/gm, "");
  // 移除多行注释
  const noBlockComments = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  return JSON.parse(noBlockComments);
}

/** 验证是否为有效的记录对象 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 验证存储文件格式 */
function isValidCronStoreFile(value: unknown): value is CronStoreFile {
  if (!isRecord(value)) return false;
  if (typeof value.version !== "number") return false;
  if (!Array.isArray(value.jobs)) return false;
  return true;
}

/** 验证运行时状态 */
function isValidCronJobRuntime(value: unknown): value is CronJobRuntime {
  if (!isRecord(value)) return false;
  const validStatuses = ["active", "paused", "completed", "failed", "disabled"];
  if (typeof value.status === "string" && !validStatuses.includes(value.status)) {
    return false;
  }
  return true;
}

/** 验证任务配置 */
function isValidCronJobConfig(value: unknown): value is CronJobConfig {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string") return false;
  if (typeof value.name !== "string") return false;
  if (typeof value.cronExpression !== "string") return false;
  if (typeof value.taskType !== "string") return false;
  if (typeof value.taskParams !== "object") return false;
  return true;
}

/** JSON 文件存储实现 */
export class JsonCronJobStore implements CronJobStore {
  private readonly storePath: string;
  private readonly quarantinePath: string;

  constructor(storePath?: string) {
    this.storePath = resolveCronStorePath(storePath);
    this.quarantinePath = resolveQuarantinePath(this.storePath);
  }

  getStorePath(): string {
    return this.storePath;
  }

  getQuarantinePath(): string {
    return this.quarantinePath;
  }

  async load(): Promise<LoadedCronStore> {
    const invalidConfigRows: CronQuarantineEntry[] = [];
    const validJobs: CronJobEntry[] = [];

    try {
      const raw = await fs.promises.readFile(this.storePath, "utf-8");
      const parsed = parseJsonWithComments(raw);

      if (!isValidCronStoreFile(parsed)) {
        console.warn("[cron-store] Invalid store file format, returning empty store");
        return {
          store: { version: 1, jobs: [] },
          quarantineJobs: [],
          invalidConfigRows: [],
        };
      }

      const now = Date.now();

      for (let i = 0; i < parsed.jobs.length; i++) {
        const entry = parsed.jobs[i];

        // 验证基本配置
        if (!isValidCronJobConfig(entry)) {
          invalidConfigRows.push({
            quarantinedAtMs: now,
            sourceIndex: i,
            reason: "Invalid job config structure",
            raw: JSON.stringify(entry),
          });
          continue;
        }

        // 验证运行时状态
        const runtime: CronJobRuntime = {
          status: entry.status ?? "active",
          lastRunAt: entry.lastRunAt,
          nextRunAt: entry.nextRunAt,
          lastSuccessAt: entry.lastSuccessAt,
          lastFailureAt: entry.lastFailureAt,
          consecutiveFailures: entry.consecutiveFailures ?? 0,
          totalRuns: entry.totalRuns ?? 0,
          totalSuccesses: entry.totalSuccesses ?? 0,
          totalFailures: entry.totalFailures ?? 0,
          createdAt: entry.createdAt ?? now,
          updatedAt: entry.updatedAt ?? now,
        };

        if (!isValidCronJobRuntime(runtime)) {
          invalidConfigRows.push({
            quarantinedAtMs: now,
            sourceIndex: i,
            reason: "Invalid job runtime status",
            job: entry,
          });
          continue;
        }

        validJobs.push({
          ...entry,
          ...runtime,
        });
      }
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      if (code === "ENOENT") {
        // 文件不存在，返回空存储
        return {
          store: { version: 1, jobs: [] },
          quarantineJobs: [],
          invalidConfigRows: [],
        };
      }
      throw err;
    }

    // 加载隔离文件
    const quarantineJobs = await this.loadQuarantine();

    return {
      store: { version: 1, jobs: validJobs },
      quarantineJobs: quarantineJobs.jobs,
      invalidConfigRows,
    };
  }

  async save(store: CronStoreFile): Promise<void> {
    const payload = JSON.stringify(store, null, 2);
    await atomicWrite(this.storePath, payload);
  }

  async loadQuarantine(): Promise<CronQuarantineFile> {
    try {
      const raw = await fs.promises.readFile(this.quarantinePath, "utf-8");
      const parsed = parseJsonWithComments(raw);

      if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.jobs)) {
        console.warn("[cron-store] Invalid quarantine file format");
        return { version: 1, jobs: [] };
      }

      const jobs: CronQuarantineEntry[] = [];
      const now = Date.now();

      for (let i = 0; i < parsed.jobs.length; i++) {
        const entry = parsed.jobs[i];
        if (!isRecord(entry) || typeof entry.reason !== "string") {
          continue;
        }

        const quarantined: CronQuarantineEntry = {
          quarantinedAtMs:
            typeof entry.quarantinedAtMs === "number" ? entry.quarantinedAtMs : now,
          sourceIndex: typeof entry.sourceIndex === "number" ? entry.sourceIndex : -1,
          reason: entry.reason,
        };

        if (isRecord(entry.job)) {
          quarantined.job = entry.job as unknown as CronJobConfig;
        }
        if (typeof entry.raw === "string") {
          quarantined.raw = entry.raw;
        }
        if (isRecord(entry.state)) {
          quarantined.state = entry.state as unknown as CronJobRuntime;
        }
        if (typeof entry.updatedAtMs === "number") {
          quarantined.updatedAtMs = entry.updatedAtMs;
        }
        if (typeof entry.scheduleIdentity === "string") {
          quarantined.scheduleIdentity = entry.scheduleIdentity;
        }

        jobs.push(quarantined);
      }

      return { version: 1, jobs };
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      if (code === "ENOENT") {
        return { version: 1, jobs: [] };
      }
      throw err;
    }
  }

  async saveQuarantine(quarantine: CronQuarantineFile): Promise<void> {
    const payload = JSON.stringify(quarantine, null, 2);
    await atomicWrite(this.quarantinePath, payload);
  }
}

/** 隔离条目唯一性 key */
function quarantineEntryKey(entry: CronQuarantineEntry): string {
  return JSON.stringify({
    id: entry.job?.id ?? null,
    sourceIndex: entry.sourceIndex,
    reason: entry.reason,
    job: entry.job ?? null,
    raw: entry.raw ?? null,
    state: entry.state ?? null,
    updatedAtMs: entry.updatedAtMs ?? null,
    scheduleIdentity: entry.scheduleIdentity ?? null,
  });
}

/** 添加到隔离文件 */
export async function quarantineEntries(
  store: CronJobStore,
  entries: CronQuarantineEntry[],
  nowMs?: number,
): Promise<string | null> {
  if (entries.length === 0) {
    return null;
  }

  const existing = await store.loadQuarantine();
  const seen = new Set(existing.jobs.map(quarantineEntryKey));
  const nextJobs = existing.jobs.slice();
  let appended = false;

  const now = nowMs ?? Date.now();

  for (const entry of [...entries].sort((a, b) => a.sourceIndex - b.sourceIndex)) {
    const key = quarantineEntryKey(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    appended = true;
    nextJobs.push({
      quarantinedAtMs: now,
      sourceIndex: entry.sourceIndex,
      reason: entry.reason,
      ...(entry.job ? { job: { ...entry.job } } : {}),
      ...(entry.raw ? { raw: entry.raw } : {}),
      ...(entry.state ? { state: { ...entry.state } } : {}),
      ...(entry.updatedAtMs !== undefined ? { updatedAtMs: entry.updatedAtMs } : {}),
      ...(entry.scheduleIdentity !== undefined
        ? { scheduleIdentity: entry.scheduleIdentity }
        : {}),
    });
  }

  if (!appended) {
    return store.getQuarantinePath();
  }

  await store.saveQuarantine({ version: 1, jobs: nextJobs });
  return store.getQuarantinePath();
}

/** 默认存储实例 */
let defaultStoreInstance: JsonCronJobStore | null = null;

/** 获取默认存储实例 */
export function getDefaultCronStore(): CronJobStore {
  if (!defaultStoreInstance) {
    defaultStoreInstance = new JsonCronJobStore();
  }
  return defaultStoreInstance;
}

/** 设置默认存储实例（用于测试） */
export function setDefaultCronStore(store: CronJobStore): void {
  defaultStoreInstance = store as JsonCronJobStore;
}
