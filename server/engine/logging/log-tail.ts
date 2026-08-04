import { createInterface } from 'node:readline';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { getResolvedSettings } from './config.js';
import { redactSensitiveLines, resolveRedactOptions } from './redact.js';

// Tail reader for the active log file, with cursor reset and line redaction.
// Migrated from openclaw/src/logging/log-tail.ts.
const DEFAULT_LIMIT = 500;
const DEFAULT_MAX_BYTES = 250_000;
const MAX_LIMIT = 5000;
const MAX_BYTES = 1_000_000;
const ROLLING_LOG_RE = /^openclaw-\d{4}-\d{2}-\d{2}\.log$/;

export type LogTailPayload = {
  file: string;
  cursor: number;
  size: number;
  lines: string[];
  truncated: boolean;
  reset: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isRollingLogFile(file: string): boolean {
  return ROLLING_LOG_RE.test(path.basename(file));
}

/** Resolves a rolling daily log path to the newest existing rolling log when needed. */
export async function resolveLogFile(file: string): Promise<string> {
  const fileStat = await fs.stat(file).catch(() => null);
  if (fileStat) {
    return file;
  }
  if (!isRollingLogFile(file)) {
    return file;
  }

  const dir = path.dirname(file);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    return file;
  }

  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && ROLLING_LOG_RE.test(entry.name))
      .map(async (entry) => {
        const fullPath = path.join(dir, entry.name);
        const entryStat = await fs.stat(fullPath).catch(() => null);
        return entryStat ? { path: fullPath, mtimeMs: entryStat.mtimeMs } : null;
      }),
  );
  const sorted = candidates
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .toSorted((a, b) => b.mtimeMs - a.mtimeMs);
  return sorted[0]?.path ?? file;
}

async function readLogSlice(params: {
  file: string;
  cursor?: number;
  limit: number;
  maxBytes: number;
}): Promise<Omit<LogTailPayload, 'file'>> {
  const fileStat = await fs.stat(params.file).catch(() => null);
  if (!fileStat) {
    return {
      cursor: 0,
      size: 0,
      lines: [],
      truncated: false,
      reset: false,
    };
  }

  const size = fileStat.size;
  const maxBytes = clamp(params.maxBytes, 1, MAX_BYTES);
  const limit = clamp(params.limit, 1, MAX_LIMIT);
  let cursor =
    typeof params.cursor === 'number' && Number.isFinite(params.cursor)
      ? Math.max(0, Math.floor(params.cursor))
      : undefined;
  let reset = false;
  let truncated = false;
  let start;

  if (cursor != null) {
    if (cursor > size) {
      // File rotated or shrank since the previous cursor; restart near the end.
      reset = true;
      start = Math.max(0, size - maxBytes);
      truncated = start > 0;
    } else {
      start = cursor;
      if (size - start > maxBytes) {
        // Cursor is valid but too stale; cap reads and tell the caller state was reset.
        reset = true;
        truncated = true;
        start = Math.max(0, size - maxBytes);
      }
    }
  } else {
    start = Math.max(0, size - maxBytes);
    truncated = start > 0;
  }

  if (size === 0 || size <= start) {
    return {
      cursor: size,
      size,
      lines: [],
      truncated,
      reset,
    };
  }

  const handle = await fs.open(params.file, 'r');
  try {
    let prefix = '';
    if (start > 0) {
      const prefixBuf = Buffer.alloc(1);
      const prefixRead = await handle.read(prefixBuf, 0, 1, start - 1);
      prefix = prefixBuf.toString('utf8', 0, prefixRead.bytesRead);
    }

    const length = Math.max(0, size - start);
    const buffer = Buffer.alloc(length);
    const readResult = await handle.read(buffer, 0, length, start);
    const text = buffer.toString('utf8', 0, readResult.bytesRead);
    let lines = text.split('\n');
    if (start > 0 && prefix !== '\n') {
      // Drop the first partial line when starting in the middle of a file.
      lines = lines.slice(1);
    }
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines = lines.slice(0, -1);
    }
    if (lines.length > limit) {
      lines = lines.slice(lines.length - limit);
    }

    cursor = size;

    return {
      cursor,
      size,
      lines,
      truncated,
      reset,
    };
  } finally {
    await handle.close();
  }
}

/** Reads and redacts the configured log tail with bounded bytes and line count. */
export async function readConfiguredLogTail(params?: {
  cursor?: number;
  limit?: number;
  maxBytes?: number;
}): Promise<LogTailPayload> {
  const file = await resolveLogFile(getResolvedSettings().file);
  const result = await readLogSlice({
    file,
    cursor: params?.cursor,
    limit: params?.limit ?? DEFAULT_LIMIT,
    maxBytes: params?.maxBytes ?? DEFAULT_MAX_BYTES,
  });
  const redaction = resolveRedactOptions();
  return {
    file,
    ...result,
    lines: redactSensitiveLines(result.lines, redaction),
  };
}

export class LogTail {
  private readonly filePath: string;
  private lines: string[] = [];
  private readonly maxLines: number;

  constructor(filePath: string, maxLines = 100) {
    this.filePath = filePath;
    this.maxLines = maxLines;
  }

  async read(): Promise<string[]> {
    try {
      const stats = await stat(this.filePath);
      if (!stats.isFile()) return [];

      const rl = createInterface({
        input: createReadStream(this.filePath, { encoding: 'utf-8' }),
        crlfDelay: Infinity,
      });

      const allLines: string[] = [];
      for await (const line of rl) {
        allLines.push(line);
      }

      this.lines = allLines.slice(-this.maxLines);
      return this.lines;
    } catch {
      return [];
    }
  }

  async filter(pattern: RegExp): Promise<string[]> {
    const lines = await this.read();
    return lines.filter(line => pattern.test(line));
  }

  getLines(): string[] {
    return this.lines;
  }

  toJSON(): string {
    return JSON.stringify(this.lines);
  }
}

export function createLogTail(filePath: string, maxLines?: number): LogTail {
  return new LogTail(filePath, maxLines);
}
