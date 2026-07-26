/** Legacy JSONL run-log parser used during migrations/imports. */
import type { CronRunLogEntry } from "./run-log/index.js";
import { decodeCronRunLogEntry } from "./run-log/entry-codec.js";

/** Parses legacy cron run-log JSONL, skipping malformed or non-matching rows. */
export function parseCronRunLogEntriesFromJsonl(
  raw: string,
  opts?: { jobId?: string },
): CronRunLogEntry[] {
  if (!raw.trim()) {
    return [];
  }
  const parsed: CronRunLogEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const obj = JSON.parse(trimmed);
      if (opts?.jobId && obj.jobId !== opts.jobId) {
        continue;
      }
      const entry = decodeCronRunLogEntry(obj);
      if (entry) {
        parsed.push(entry);
      }
    } catch {
      // Legacy JSONL migration ignores malformed historical rows.
    }
  }
  return parsed;
}
