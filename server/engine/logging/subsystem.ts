import { logger } from '../../logger.js';

export interface SubsystemLogger {
  trace(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export function createSubsystemLogger(name: string): SubsystemLogger {
  const prefix = `[${name}]`;
  return {
    trace: (msg, ...args) => logger.debug(`${prefix} ${msg}`, ...args),
    debug: (msg, ...args) => logger.debug(`${prefix} ${msg}`, ...args),
    info: (msg, ...args) => logger.info(`${prefix} ${msg}`, ...args),
    warn: (msg, ...args) => logger.warn(`${prefix} ${msg}`, ...args),
    error: (msg, ...args) => logger.error(`${prefix} ${msg}`, ...args),
  };
}
