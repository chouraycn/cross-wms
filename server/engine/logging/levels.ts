export enum LogLevel {
  Trace = 0,
  Debug = 1,
  Info = 2,
  Warn = 3,
  Error = 4,
  Fatal = 5,
  Silent = 6,
}

export function parseLogLevel(level: string | undefined): LogLevel {
  if (!level) return LogLevel.Info;
  const lower = level.toLowerCase().trim();
  switch (lower) {
    case 'trace': return LogLevel.Trace;
    case 'debug': return LogLevel.Debug;
    case 'info': return LogLevel.Info;
    case 'warn': case 'warning': return LogLevel.Warn;
    case 'error': return LogLevel.Error;
    case 'fatal': return LogLevel.Fatal;
    case 'silent': case 'off': return LogLevel.Silent;
    default: return LogLevel.Info;
  }
}

export function compareLogLevels(a: LogLevel, b: LogLevel): number {
  return a - b;
}

export function shouldLog(currentLevel: LogLevel, threshold: LogLevel): boolean {
  return currentLevel >= threshold;
}

export function levelToString(level: LogLevel): string {
  switch (level) {
    case LogLevel.Trace: return 'trace';
    case LogLevel.Debug: return 'debug';
    case LogLevel.Info: return 'info';
    case LogLevel.Warn: return 'warn';
    case LogLevel.Error: return 'error';
    case LogLevel.Fatal: return 'fatal';
    case LogLevel.Silent: return 'silent';
    default: return 'info';
  }
}
