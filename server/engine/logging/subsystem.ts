import { logger } from '../../logger.js';

export interface SubsystemLogger {
  trace(msg: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  isEnabled(level: string, sink?: string): boolean;
  /**
   * 派生子作用域 logger，前缀形如 `[gateway/model-pricing]`。
   * 多处调用点依赖该 API（server.impl.ts / model-pricing-cache.ts / server-channels.ts /
   * diagnostic-memory.ts 等），缺失会在模块 import 阶段抛
   * `createSubsystemLogger(...).child is not a function` 导致服务启动崩溃。
   */
  child(name: string): SubsystemLogger;
}

function normalizeName(name: string | undefined | null): string {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed.length > 0 ? trimmed : 'unknown';
}

export function createSubsystemLogger(name: string): SubsystemLogger {
  const subsystem = normalizeName(name);
  const prefix = `[${subsystem}]`;
  return {
    trace: (msg, ...args) => logger.debug(`${prefix} ${msg}`, ...args),
    debug: (msg, ...args) => logger.debug(`${prefix} ${msg}`, ...args),
    info: (msg, ...args) => logger.info(`${prefix} ${msg}`, ...args),
    warn: (msg, ...args) => logger.warn(`${prefix} ${msg}`, ...args),
    error: (msg, ...args) => logger.error(`${prefix} ${msg}`, ...args),
    isEnabled: (_level: string, _sink?: string) => true,
    child: (childName: string) =>
      createSubsystemLogger(`${subsystem}/${normalizeName(childName)}`),
  };
}

export type SubsystemRuntime = {
  logger: SubsystemLogger;
  setLevel(level: string): void;
};

export function createSubsystemRuntime(name: string): SubsystemRuntime {
  const subLogger = createSubsystemLogger(name);
  return {
    logger: subLogger,
    setLevel: (_level: string) => {
      // Level management handled by global logger; no-op per subsystem
    },
  };
}

export function runtimeForLogger(subLogger: SubsystemLogger): SubsystemRuntime {
  return {
    logger: subLogger,
    setLevel: (_level: string) => {
      // Level management handled by global logger; no-op per subsystem
    },
  };
}

export function stripRedundantSubsystemPrefixForConsole(
  text: string,
  _subsystem?: string,
): string {
  return text;
}
