import type { PluginLogger } from './types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function createPluginLogger(
  pluginId: string,
  minLevel: LogLevel = 'info',
): PluginLogger {
  const prefix = `[${pluginId}]`;
  const minLevelNum = LOG_LEVELS[minLevel];

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVELS[level] >= minLevelNum;
  };

  return {
    debug(message: string, ...args: unknown[]): void {
      if (shouldLog('debug')) {
        console.debug(prefix, message, ...args);
      }
    },
    info(message: string, ...args: unknown[]): void {
      if (shouldLog('info')) {
        console.info(prefix, message, ...args);
      }
    },
    warn(message: string, ...args: unknown[]): void {
      if (shouldLog('warn')) {
        console.warn(prefix, message, ...args);
      }
    },
    error(message: string, ...args: unknown[]): void {
      if (shouldLog('error')) {
        console.error(prefix, message, ...args);
      }
    },
  };
}

export function createNoopLogger(): PluginLogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

export class LogCollector {
  private logs: Array<{
    level: LogLevel;
    message: string;
    args: unknown[];
    timestamp: number;
  }> = [];

  collect(level: LogLevel, message: string, ...args: unknown[]): void {
    this.logs.push({
      level,
      message,
      args,
      timestamp: Date.now(),
    });
  }

  getLogs(): typeof this.logs {
    return [...this.logs];
  }

  filterByLevel(level: LogLevel): typeof this.logs {
    const minLevel = LOG_LEVELS[level];
    return this.logs.filter((l) => LOG_LEVELS[l.level] >= minLevel);
  }

  clear(): void {
    this.logs = [];
  }

  size(): number {
    return this.logs.length;
  }

  toConsole(): void {
    for (const log of this.logs) {
      const fn = console[log.level] || console.log;
      fn(log.message, ...log.args);
    }
  }
}
