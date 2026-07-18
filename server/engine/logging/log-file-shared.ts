import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_LOG_DIR, LOG_PREFIX, LOG_SUFFIX } from './log-file-path.js';

const MAX_LOG_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ROTATED_LOG_FILES = 5;

export function canUseNodeFs(): boolean {
  try {
    return typeof fs !== 'undefined' && typeof fs.writeFileSync === 'function';
  } catch {
    return false;
  }
}

export function ensureLogDir(dir: string): void {
  if (!canUseNodeFs()) {
    return;
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
}

export function getFileSize(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export function appendLogLine(file: string, line: string): boolean {
  try {
    fs.appendFileSync(file, `${line}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function pruneOldRollingLogs(dir: string): void {
  if (!canUseNodeFs()) {
    return;
  }
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const cutoff = Date.now() - MAX_LOG_AGE_MS;
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      if (!entry.name.startsWith(`${LOG_PREFIX}-`) || !entry.name.endsWith(LOG_SUFFIX)) {
        continue;
      }
      const fullPath = path.join(dir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.mtimeMs < cutoff) {
          fs.rmSync(fullPath, { force: true });
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

export function rotateLogFile(file: string, maxFiles: number = MAX_ROTATED_LOG_FILES): boolean {
  if (!canUseNodeFs()) {
    return false;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const ext = path.extname(file);
    const base = file.slice(0, file.length - ext.length);

    fs.rmSync(`${base}.${maxFiles}${ext}`, { force: true });

    for (let index = maxFiles - 1; index >= 1; index -= 1) {
      const from = `${base}.${index}${ext}`;
      if (!fs.existsSync(from)) {
        continue;
      }
      fs.renameSync(from, `${base}.${index + 1}${ext}`);
    }

    if (fs.existsSync(file)) {
      fs.renameSync(file, `${base}.1${ext}`);
    }
    return true;
  } catch {
    return false;
  }
}

export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
