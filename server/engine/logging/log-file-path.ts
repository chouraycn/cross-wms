import path from 'node:path';
import os from 'node:os';

export const LOG_PREFIX = 'cross-wms';
export const LOG_SUFFIX = '.log';

function resolveLogDir(): string {
  if (process.env.CROSS_WMS_LOG_DIR) {
    return process.env.CROSS_WMS_LOG_DIR;
  }
  const tmpDir = os.tmpdir();
  return path.join(tmpDir, 'cross-wms-logs');
}

export const DEFAULT_LOG_DIR = resolveLogDir();

export function resolveLogFilePath(filename?: string): string {
  if (filename && path.isAbsolute(filename)) {
    return filename;
  }
  return path.join(DEFAULT_LOG_DIR, filename ?? `${LOG_PREFIX}.log`);
}

export function rollingLogPathForDate(dir: string, date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return path.join(dir, `${LOG_PREFIX}-${year}-${month}-${day}${LOG_SUFFIX}`);
}

export function isRollingLogPath(file: string): boolean {
  const base = path.basename(file);
  return (
    base.startsWith(`${LOG_PREFIX}-`) &&
    base.endsWith(LOG_SUFFIX) &&
    /\d{4}-\d{2}-\d{2}/.test(base)
  );
}

export function defaultRollingLogPathForToday(): string {
  return rollingLogPathForDate(DEFAULT_LOG_DIR, new Date());
}
