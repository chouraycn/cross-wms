import fs from 'node:fs';
import path from 'node:path';
import { LogLevel, parseLogLevel, levelToString } from './levels.js';
import { resolveEnvLogLevelOverride } from './env-log-level.js';
import { loggingState } from './state.js';
import type { LoggerSettings } from './types.js';
import { DEFAULT_LOG_DIR, defaultRollingLogPathForToday } from './log-file-path.js';

const DEFAULT_MAX_LOG_FILE_BYTES = 100 * 1024 * 1024;

let cachedConfig: { path: string; logging: LoggerSettings | undefined } | undefined;

export function shouldSkipMutatingLoggingConfigRead(argv: string[] = process.argv): boolean {
  const args = argv.slice(2);
  const primary = args[0];
  const secondary = args[1];
  return primary === 'config' && (secondary === 'schema' || secondary === 'validate');
}

function resolveConfigPath(): string | undefined {
  const candidates = [
    process.env.CROSS_WMS_CONFIG,
    path.join(process.cwd(), 'cross-wms.json'),
    path.join(process.cwd(), 'config.json'),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // continue
    }
  }
  return undefined;
}

export function readLoggingConfig(): LoggerSettings | undefined {
  if (shouldSkipMutatingLoggingConfigRead()) {
    return undefined;
  }
  try {
    const configPath = resolveConfigPath();
    if (!configPath) {
      return undefined;
    }
    if (cachedConfig?.path === configPath) {
      return cachedConfig.logging;
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const logging = parsed?.logging ?? parsed?.log;
    const resolved = logging && typeof logging === 'object' ? (logging as LoggerSettings) : undefined;
    cachedConfig = { path: configPath, logging: resolved };
    return resolved;
  } catch {
    return undefined;
  }
}

export function resolveMaxLogFileBytes(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    return Math.floor(raw);
  }
  return DEFAULT_MAX_LOG_FILE_BYTES;
}

export function normalizeLoggerSettings(cfg?: LoggerSettings): Required<LoggerSettings> {
  const envLevel = resolveEnvLogLevelOverride();
  const defaultLevel =
    process.env.NODE_ENV === 'development' ? LogLevel.Debug : LogLevel.Info;

  return {
    level: envLevel ?? (cfg?.level !== undefined ? cfg.level : defaultLevel),
    file: cfg?.file ?? defaultRollingLogPathForToday(),
    maxFileBytes: resolveMaxLogFileBytes(cfg?.maxFileBytes),
    consoleLevel: cfg?.consoleLevel ?? LogLevel.Info,
    consoleStyle: cfg?.consoleStyle ?? (process.stdout.isTTY ? 'pretty' : 'compact'),
  };
}

export function getResolvedSettings(): Required<LoggerSettings> {
  if (loggingState.overrideSettings) {
    return normalizeLoggerSettings(loggingState.overrideSettings as LoggerSettings);
  }
  return normalizeLoggerSettings(readLoggingConfig());
}

export function setLoggerOverride(settings: LoggerSettings | null): void {
  loggingState.overrideSettings = settings;
  loggingState.cachedLogger = null;
  loggingState.cachedSettings = null;
  loggingState.cachedConsoleSettings = null;
}

export function resetLoggerConfig(): void {
  cachedConfig = undefined;
  loggingState.overrideSettings = null;
  loggingState.cachedLogger = null;
  loggingState.cachedSettings = null;
  loggingState.cachedConsoleSettings = null;
}

export { DEFAULT_MAX_LOG_FILE_BYTES, DEFAULT_LOG_DIR };
