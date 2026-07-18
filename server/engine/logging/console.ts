import util from 'node:util';
import { LogLevel, levelToString } from './levels.js';
import { readLoggingConfig, shouldSkipMutatingLoggingConfigRead } from './config.js';
import { resolveEnvLogLevelOverride } from './env-log-level.js';
import { loggingState } from './state.js';
import { redactSensitiveText } from './redact.js';
import { formatTimestamp, formatLocalIsoWithOffset } from './timestamps.js';
import type { ConsoleStyle, LoggerSettings } from './types.js';

export type { ConsoleStyle };

type ConsoleSettings = {
  level: LogLevel;
  style: ConsoleStyle;
};

export type ConsoleLoggerSettings = ConsoleSettings;

function normalizeConsoleLevel(level?: LogLevel | string): LogLevel {
  if (!level && process.env.VITEST === 'true' && process.env.CROSS_WMS_TEST_CONSOLE !== '1') {
    return LogLevel.Silent;
  }
  if (typeof level === 'number') return level;
  return parseConsoleLevel(level, LogLevel.Info);
}

function parseConsoleLevel(level: string | undefined, defaultLevel: LogLevel): LogLevel {
  if (!level) return defaultLevel;
  const lower = level.toLowerCase().trim();
  switch (lower) {
    case 'trace': return LogLevel.Trace;
    case 'debug': return LogLevel.Debug;
    case 'info': return LogLevel.Info;
    case 'warn': case 'warning': return LogLevel.Warn;
    case 'error': return LogLevel.Error;
    case 'fatal': return LogLevel.Fatal;
    case 'silent': case 'off': return LogLevel.Silent;
    default: return defaultLevel;
  }
}

function normalizeConsoleStyle(style?: string): ConsoleStyle {
  if (style === 'compact' || style === 'json' || style === 'pretty') {
    return style;
  }
  if (!process.stdout.isTTY) {
    return 'compact';
  }
  return 'pretty';
}

function resolveConsoleSettings(): ConsoleSettings {
  const envLevel = resolveEnvLogLevelOverride();

  if (
    process.env.VITEST === 'true' &&
    process.env.CROSS_WMS_TEST_CONSOLE !== '1' &&
    !envLevel &&
    !loggingState.overrideSettings
  ) {
    return { level: LogLevel.Silent, style: normalizeConsoleStyle(undefined) };
  }

  let cfg: LoggerSettings | undefined =
    (loggingState.overrideSettings as LoggerSettings | null) ?? readLoggingConfig();
  if (!cfg && !shouldSkipMutatingLoggingConfigRead()) {
    if (loggingState.resolvingConsoleSettings) {
      cfg = undefined;
    } else {
      loggingState.resolvingConsoleSettings = true;
      try {
        cfg = undefined;
      } finally {
        loggingState.resolvingConsoleSettings = false;
      }
    }
  }
  const level = envLevel ?? normalizeConsoleLevel(cfg?.consoleLevel);
  const style = normalizeConsoleStyle(cfg?.consoleStyle);
  return { level, style };
}

function consoleSettingsChanged(a: ConsoleSettings | null, b: ConsoleSettings): boolean {
  if (!a) return true;
  return a.level !== b.level || a.style !== b.style;
}

export function getConsoleSettings(): ConsoleLoggerSettings {
  const settings = resolveConsoleSettings();
  const cached = loggingState.cachedConsoleSettings as ConsoleSettings | null;
  if (!cached || consoleSettingsChanged(cached, settings)) {
    loggingState.cachedConsoleSettings = settings;
  }
  return loggingState.cachedConsoleSettings as ConsoleSettings;
}

export function getResolvedConsoleSettings(): ConsoleLoggerSettings {
  return getConsoleSettings();
}

export function routeLogsToStderr(): void {
  loggingState.forceConsoleToStderr = true;
}

export function setConsoleSubsystemFilter(filters?: string[] | null): void {
  if (!filters || filters.length === 0) {
    loggingState.consoleSubsystemFilter = null;
    return;
  }
  const normalized = filters.map((value) => value.trim()).filter((value) => value.length > 0);
  loggingState.consoleSubsystemFilter = normalized.length > 0 ? normalized : null;
}

export function setConsoleTimestampPrefix(enabled: boolean): void {
  loggingState.consoleTimestampPrefix = enabled;
}

function normalizeConsoleSubsystem(subsystem?: string | null): string | null {
  if (typeof subsystem !== 'string') return null;
  const normalized = subsystem.trim();
  return normalized.length > 0 ? normalized : null;
}

export function shouldLogSubsystemToConsole(subsystem?: string | null): boolean {
  const filter = loggingState.consoleSubsystemFilter;
  if (!filter || filter.length === 0) return true;
  const normalizedSubsystem = normalizeConsoleSubsystem(subsystem);
  if (!normalizedSubsystem) return false;
  return filter.some(
    (prefix) => normalizedSubsystem === prefix || normalizedSubsystem.startsWith(`${prefix}/`),
  );
}

export function formatConsoleTimestamp(style: ConsoleStyle): string {
  const now = new Date();
  if (style === 'pretty') {
    return formatTimestamp(now, { style: 'short' }).replace(/[+-]\d{2}:\d{2}$/, '');
  }
  return formatLocalIsoWithOffset(now);
}

function hasTimestampPrefix(value: string): boolean {
  return /^(?:\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)/.test(
    value,
  );
}

function isEpipeError(err: unknown): boolean {
  const code = (err as { code?: string })?.code;
  return code === 'EPIPE' || code === 'EIO';
}

export function enableConsoleCapture(): void {
  if (loggingState.consolePatched) {
    return;
  }
  loggingState.consolePatched = true;

  if (!loggingState.streamErrorHandlersInstalled) {
    loggingState.streamErrorHandlersInstalled = true;
    for (const stream of [process.stdout, process.stderr]) {
      stream.on('error', (err) => {
        if (isEpipeError(err)) {
          const exitCode = process.exitCode;
          process.exit(exitCode !== undefined && exitCode !== 0 && exitCode !== '0' ? exitCode : 0);
          return;
        }
        throw err;
      });
    }
  }

  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
    trace: console.trace,
  };
  loggingState.rawConsole = {
    log: original.log,
    info: original.info,
    warn: original.warn,
    error: original.error,
  };

  const forward =
    (level: LogLevel, orig: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      const formatted = util.format(...args);
      const trimmed = formatted.trimStart();
      const shouldPrefixTimestamp =
        loggingState.consoleTimestampPrefix && trimmed.length > 0 && !hasTimestampPrefix(trimmed);
      const timestamp = shouldPrefixTimestamp
        ? formatConsoleTimestamp(getConsoleSettings().style)
        : '';

      if (loggingState.forceConsoleToStderr) {
        try {
          const redacted = redactSensitiveText(formatted);
          const line = timestamp ? `${timestamp} ${redacted}` : redacted;
          process.stderr.write(`${line}\n`);
        } catch (err) {
          if (isEpipeError(err)) return;
          throw err;
        }
      } else {
        try {
          const redacted = redactSensitiveText(formatted);
          if (!timestamp) {
            if (args.length === 0) {
              orig.apply(console, args as []);
              return;
            }
            orig.call(console, redacted);
            return;
          }
          orig.call(console, redacted ? `${timestamp} ${redacted}` : timestamp);
        } catch (err) {
          if (isEpipeError(err)) return;
          throw err;
        }
      }
    };

  console.log = forward(LogLevel.Info, original.log);
  console.info = forward(LogLevel.Info, original.info);
  console.warn = forward(LogLevel.Warn, original.warn);
  console.error = forward(LogLevel.Error, original.error);
  console.debug = forward(LogLevel.Debug, original.debug);
  console.trace = forward(LogLevel.Trace, original.trace);
}
