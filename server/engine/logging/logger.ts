import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LogLevel, levelToString, shouldLog } from './levels.js';
import {
  getResolvedSettings,
  setLoggerOverride,
  DEFAULT_MAX_LOG_FILE_BYTES,
} from './config.js';
import { loggingState } from './state.js';
import { redactSensitiveText, redactObject } from './redact.js';
import { formatTimestamp } from './timestamps.js';
import { ensureLogDir, appendLogLine, getFileSize, rotateLogFile, pruneOldRollingLogs } from './log-file-shared.js';
import { isRollingLogPath } from './log-file-path.js';
import type { LoggerSettings, DiagnosticEvent } from './types.js';

export type { LoggerSettings } from './types.js';

const MAX_ROTATED_LOG_FILES = 5;

type LogRecord = {
  level: string;
  time: string;
  msg: string;
  hostname: string;
  pid: number;
  [key: string]: unknown;
};

type LoggerTransport = (record: LogRecord) => void;

export class EngineLogger {
  private level: LogLevel;
  private file: string;
  private maxFileBytes: number;
  private transports: LoggerTransport[] = [];
  private currentFileBytes: number = 0;
  private warnedAboutRotationFailure: boolean = false;
  private cachedHostname: string | null = null;

  constructor(settings?: Partial<LoggerSettings>) {
    const resolved = settings ? { ...getResolvedSettings(), ...settings } : getResolvedSettings();
    this.level = resolved.level;
    this.file = resolved.file;
    this.maxFileBytes = resolved.maxFileBytes || DEFAULT_MAX_LOG_FILE_BYTES;
    this.initFileTransport();
  }

  private resolveHostname(): string {
    if (this.cachedHostname) return this.cachedHostname;
    try {
      this.cachedHostname = os.hostname().trim() || 'unknown';
    } catch {
      this.cachedHostname = 'unknown';
    }
    return this.cachedHostname;
  }

  private initFileTransport(): void {
    if (this.level === LogLevel.Silent) return;

    try {
      const dir = path.dirname(this.file);
      ensureLogDir(dir);

      if (isRollingLogPath(this.file)) {
        pruneOldRollingLogs(dir);
      }

      this.currentFileBytes = getFileSize(this.file);

      this.transports.push((record) => {
        try {
          const line = JSON.stringify(redactObject(record));
          const redactedLine = redactSensitiveText(line);
          const payload = `${redactedLine}\n`;
          const payloadBytes = Buffer.byteLength(payload, 'utf8');
          const nextBytes = this.currentFileBytes + payloadBytes;

          if (this.currentFileBytes > 0 && nextBytes > this.maxFileBytes) {
            if (rotateLogFile(this.file, MAX_ROTATED_LOG_FILES)) {
              this.currentFileBytes = getFileSize(this.file);
              this.warnedAboutRotationFailure = false;
            } else if (!this.warnedAboutRotationFailure) {
              this.warnedAboutRotationFailure = true;
              process.stderr.write(
                `[cross-wms] log file rotation failed; continuing writes file=${this.file} maxFileBytes=${this.maxFileBytes}\n`,
              );
            }
          }

          if (appendLogLine(this.file, redactedLine)) {
            this.currentFileBytes += payloadBytes;
          }
        } catch {
          // never block on logging failures
        }
      });
    } catch {
      // ignore file transport setup failures
    }
  }

  attachTransport(transport: LoggerTransport): void {
    this.transports.push(transport);
  }

  private formatMessage(level: LogLevel, args: unknown[]): LogRecord {
    const now = new Date();
    const msg = args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');

    return {
      level: levelToString(level),
      time: formatTimestamp(now, { style: 'long' }),
      msg,
      hostname: this.resolveHostname(),
      pid: process.pid,
    };
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    if (!shouldLog(level, this.level)) return;

    const record = this.formatMessage(level, args);

    for (const transport of this.transports) {
      try {
        transport(record);
      } catch {
        // never block on logging failures
      }
    }
  }

  trace(...args: unknown[]): void {
    this.log(LogLevel.Trace, ...args);
  }

  debug(...args: unknown[]): void {
    this.log(LogLevel.Debug, ...args);
  }

  info(...args: unknown[]): void {
    this.log(LogLevel.Info, ...args);
  }

  warn(...args: unknown[]): void {
    this.log(LogLevel.Warn, ...args);
  }

  error(...args: unknown[]): void {
    this.log(LogLevel.Error, ...args);
  }

  fatal(...args: unknown[]): void {
    this.log(LogLevel.Fatal, ...args);
  }

  isLevelEnabled(level: LogLevel): boolean {
    return shouldLog(level, this.level);
  }

  child(bindings: Record<string, unknown>): EngineLogger {
    const child = new EngineLogger({
      level: this.level,
      file: this.file,
      maxFileBytes: this.maxFileBytes,
    });
    child.transports = [];
    for (const transport of this.transports) {
      child.transports.push((record) => {
        transport({ ...record, ...bindings });
      });
    }
    return child;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getFile(): string {
    return this.file;
  }
}

let defaultLogger: EngineLogger | null = null;

export function getLogger(): EngineLogger {
  if (!defaultLogger) {
    defaultLogger = new EngineLogger();
  }
  return defaultLogger;
}

export function getChildLogger(
  bindings?: Record<string, unknown>,
  opts?: { level?: LogLevel },
): EngineLogger {
  const base = getLogger();
  if (bindings) {
    return base.child(bindings);
  }
  return base;
}

export function isFileLogLevelEnabled(level: LogLevel): boolean {
  return getLogger().isLevelEnabled(level);
}

export function resetLogger(): void {
  defaultLogger = null;
  loggingState.cachedLogger = null;
  loggingState.cachedSettings = null;
  loggingState.cachedConsoleSettings = null;
  loggingState.overrideSettings = null;
}

export { setLoggerOverride };
