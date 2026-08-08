// @ts-nocheck
// Legacy cron JSON/state store loader and archiver for doctor migration.
import fs from "node:fs/promises";
import path from "node:path";
import { isRecord } from "@openclaw-src/../packages/normalization-core/src/record-coerce.js";
import { normalizeOptionalString } from "@openclaw-src/../packages/normalization-core/src/string-coerce.js";
import { coerceFiniteScheduleNumber } from "@openclaw-src/cron/schedule-number.js";
import { normalizeCronStaggerMs } from "@openclaw-src/cron/stagger.js";
import type {
  CronConfigJobRuntimeEntry,
  LoadedCronStore,
  QuarantinedCronConfigJob,
} from "@openclaw-src/cron/store.js";
import type { CronStoreFile } from "@openclaw-src/cron/types.js";
import { parseJsonWithJson5Fallback } from "@openclaw-src/utils/parse-json-compat.js";

const LEGACY_CRON_ARCHIVE_SUFFIX = ".migrated";

function resolveLegacyCronStatePath(storePath: string): string {
  if (storePath.endsWith(".json")) {
    return storePath.replace(/\.json$/, "-state.json");
  }
  return `${storePath}-state.json`;
}

async function legacyCronFileExists(filePath: string): Promise<boolean> {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function archiveLegacyCronFile(filePath: string): Promise<void> {
  if (!(await legacyCronFileExists(filePath))) {
    return;
  }
  let archivePath = `${filePath}${LEGACY_CRON_ARCHIVE_SUFFIX}`;
  for (let index = 2; await legacyCronFileExists(archivePath); index += 1) {
    archivePath = `${filePath}${LEGACY_CRON_ARCHIVE_SUFFIX}.${index}`;
  }
  await fs.rename(filePath, archivePath).catch(() => undefined);
}

function parseCronStateFile(raw: string): {
  version: 1;
  jobs: Record<string, CronConfigJobRuntimeEntry>;
} | null {
  try {
    const parsed = parseJsonWithJson5Fallback(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const record = parsed as Record<string, any>;
    if (
      record.version !== 1 ||
      typeof record.jobs !== "object" ||
      record.jobs === null ||
      Array.isArray(record.jobs)
    ) {
      return null;
    }
    return {
      version: 1,
      jobs: record.jobs as Record<string, CronConfigJobRuntimeEntry>,
    };
  } catch {
    return null;
  }
}

function readString(record: Record<string, any>, key: string): string | undefined {
  return normalizeOptionalString(record[key]);
}

function readNumber(record: Record<string, any>, key: string): number | undefined {
  return coerceFiniteScheduleNumber(record[key]);
}

function legacySchedulePayloadFromRecord(
  schedule: Record<string, any>,
):
  | { kind: "at"; at: string }
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "cron"; expr: string; tz?: string; staggerMs?: number }
  | undefined {
  const rawKind = readString(schedule, "kind")?.toLowerCase();
  const expr = readString(schedule, "expr") ?? readString(schedule, "cron");
  const at = readString(schedule, "at");
  const atMs = readNumber(schedule, "atMs");
  const everyMs = readNumber(schedule, "everyMs");
  const anchorMs = readNumber(schedule, "anchorMs");
  const tz = readString(schedule, "tz");
  const staggerMs = normalizeCronStaggerMs(schedule.staggerMs);
  const kind =
    rawKind === "at" || rawKind === "every" || rawKind === "cron"
      ? rawKind
      : at || atMs !== undefined
        ? "at"
        : everyMs !== undefined
          ? "every"
          : expr
            ? "cron"
            : undefined;

  if (kind === "at") {
    return at
      ? { kind: "at", at }
      : atMs !== undefined
        ? { kind: "at", at: String(atMs) }
        : undefined;
  }
  if (kind === "every" && everyMs !== undefined) {
    return { kind: "every", everyMs, anchorMs };
  }
  if (kind === "cron" && expr) {
    return { kind: "cron", expr, tz, staggerMs };
  }
  return undefined;
}

function tryLegacyCronScheduleIdentity(job: Record<string, any>): string | undefined {
  const schedule =
    job.schedule && typeof job.schedule === "object" && !Array.isArray(job.schedule)
      ? legacySchedulePayloadFromRecord(job.schedule as Record<string, any>)
      : legacySchedulePayloadFromRecord(job);
  if (!schedule) {
    return undefined;
  }
  return JSON.stringify({
    version: 1,
    enabled: typeof job.enabled === "boolean" ? job.enabled : true,
    schedule,
  });
}

function getRawCronJobs(parsed: any): any[] {
  return Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.jobs)
      ? parsed.jobs
      : [];
}

function cloneConfigJobs(jobs: Array<Record<string, any>>): Array<Record<string, any>> {
  return jobs.map((job) => structuredClone(job));
}

async function loadStateFile(
  statePath: string,
): Promise<{ version: 1; jobs: Record<string, CronConfigJobRuntimeEntry> } | null> {
  let raw: string;
  try {
    raw = await fs.readFile(statePath, "utf-8");
  } catch (err) {
    if ((err as { code?: any })?.code === "ENOENT") {
      return null;
    }
    throw new Error(`Failed to read cron state at ${statePath}: ${String(err)}`, {
      cause: err,
    });
  }

  return parseCronStateFile(raw);
}

function hasInlineState(jobs: Array<Record<string, any> | null | undefined>): boolean {
  return jobs.some(
    (job) => job != null && isRecord(job.state) && Object.keys(job.state).length > 0,
  );
}

function ensureJobStateObject(job: CronStoreFile["jobs"][number]): void {
  if (!isRecord(job.state)) {
    job.state = {} as never;
  }
}

function backfillMissingRuntimeFields(job: CronStoreFile["jobs"][number]): void {
  ensureJobStateObject(job);
  if (typeof job.updatedAtMs !== "number") {
    job.updatedAtMs = typeof job.createdAtMs === "number" ? job.createdAtMs : Date.now();
  }
}

function resolveUpdatedAtMs(job: CronStoreFile["jobs"][number], updatedAtMs: any): number {
  if (typeof updatedAtMs === "number" && Number.isFinite(updatedAtMs)) {
    return updatedAtMs;
  }
  if (typeof job.updatedAtMs === "number" && Number.isFinite(job.updatedAtMs)) {
    return job.updatedAtMs;
  }
  return typeof job.createdAtMs === "number" && Number.isFinite(job.createdAtMs)
    ? job.createdAtMs
    : Date.now();
}

function mergeStateFileEntry(job: CronStoreFile["jobs"][number], entry: any): void {
  if (!isRecord(entry)) {
    backfillMissingRuntimeFields(job);
    return;
  }
  job.updatedAtMs = resolveUpdatedAtMs(job, entry.updatedAtMs);
  job.state = isRecord(entry.state) ? (entry.state as never) : ({} as never);
  if (
    typeof entry.scheduleIdentity === "string" &&
    entry.scheduleIdentity !==
      tryLegacyCronScheduleIdentity(job as unknown as Record<string, any>)
  ) {
    ensureJobStateObject(job);
    job.state.nextRunAtMs = undefined;
  }
}

function resolveCronStateId(job: Record<string, any>): string | undefined {
  return normalizeOptionalString(job.id) ?? normalizeOptionalString(job.jobId);
}

/** Return true when legacy cron JSON or state files exist for a store path. */
export async function legacyCronStoreFilesExist(storePath: string): Promise<boolean> {
  const resolvedStorePath = path.resolve(storePath);
  return (
    (await legacyCronFileExists(resolvedStorePath)) ||
    (await legacyCronFileExists(resolveLegacyCronStatePath(resolvedStorePath)))
  );
}

/** Rename legacy cron JSON/state files after successful migration. */
export async function archiveLegacyCronStoreForMigration(storePath: string): Promise<void> {
  const resolvedStorePath = path.resolve(storePath);
  await Promise.all([
    archiveLegacyCronFile(resolvedStorePath),
    archiveLegacyCronFile(resolveLegacyCronStatePath(resolvedStorePath)),
  ]);
}

/** Load legacy cron JSON/state files into the current loaded-store shape for migration. */
export async function loadLegacyCronStoreForMigration(storePath: string): Promise<LoadedCronStore> {
  const resolvedStorePath = path.resolve(storePath);
  try {
    const raw = await fs.readFile(resolvedStorePath, "utf-8");
    let parsed: any;
    try {
      parsed = parseJsonWithJson5Fallback(raw);
    } catch (err) {
      throw new Error(`Failed to parse cron store at ${resolvedStorePath}: ${String(err)}`, {
        cause: err,
      });
    }
    const rawJobs = getRawCronJobs(parsed);
    const configJobIndexes: number[] = [];
    const configRows: Array<Record<string, any>> = [];
    const configJobRuntimeEntries: CronConfigJobRuntimeEntry[] = [];
    const invalidConfigRows: QuarantinedCronConfigJob[] = [];
    for (const [index, row] of rawJobs.entries()) {
      if (isRecord(row)) {
        configJobIndexes.push(index);
        configRows.push(row);
      } else {
        invalidConfigRows.push({
          sourceIndex: index,
          reason: "non-object-row",
          raw: structuredClone(row),
        });
      }
    }
    const store: CronStoreFile = {
      version: 1,
      jobs: configRows as never as CronStoreFile["jobs"],
    };
    const jobs = store.jobs as unknown as Array<Record<string, any>>;
    const configJobs = cloneConfigJobs(configRows);

    const stateFile = await loadStateFile(resolveLegacyCronStatePath(resolvedStorePath));
    const hasLegacyInlineState = !stateFile && hasInlineState(jobs);

    if (stateFile) {
      for (const job of store.jobs) {
        const stateId = resolveCronStateId(job as unknown as Record<string, any>);
        const entry = stateId ? stateFile.jobs[stateId] : undefined;
        configJobRuntimeEntries.push(isRecord(entry) ? structuredClone(entry) : {});
        if (entry) {
          mergeStateFileEntry(job, entry);
        } else {
          backfillMissingRuntimeFields(job);
        }
      }
    } else if (!hasLegacyInlineState) {
      for (const job of store.jobs) {
        backfillMissingRuntimeFields(job);
      }
    }

    for (const job of store.jobs) {
      ensureJobStateObject(job);
    }

    return { store, configJobs, configJobIndexes, configJobRuntimeEntries, invalidConfigRows };
  } catch (err) {
    if ((err as { code?: any })?.code === "ENOENT") {
      return {
        store: { version: 1, jobs: [] },
        configJobs: [],
        configJobIndexes: [],
        configJobRuntimeEntries: [],
        invalidConfigRows: [],
      };
    }
    throw err;
  }
}
