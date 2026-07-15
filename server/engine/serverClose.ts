/**
 * 服务器关闭编排 — 参考 OpenClaw gateway/server-close.ts
 *
 * 协调钩子、排空、套接字、插件和运行时清理。
 */

import { logger } from '../logger.js';
import { publishEvent } from './events.js';

export interface ShutdownResult {
  durationMs: number;
  warnings: string[];
}

export interface ShutdownHook {
  name: string;
  fn: () => Promise<void>;
  timeoutMs?: number;
}

export interface ServerCloseHandles {
  httpServer?: { close: (cb?: () => void) => void };
  wsServer?: { close: (cb?: () => void) => void };
}

const GATEWAY_SHUTDOWN_HOOK_TIMEOUT_MS = 5_000;
const WEBSOCKET_CLOSE_GRACE_MS = 1_000;
const HTTP_CLOSE_FORCE_WAIT_MS = 5_000;

const shutdownHooks: ShutdownHook[] = [];
let isShuttingDown = false;

export function registerShutdownHook(hook: ShutdownHook): void {
  shutdownHooks.push(hook);
  logger.debug(`[ServerClose] 注册关闭钩子: ${hook.name}`);
}

export function unregisterShutdownHook(name: string): void {
  const index = shutdownHooks.findIndex((h) => h.name === name);
  if (index >= 0) {
    shutdownHooks.splice(index, 1);
    logger.debug(`[ServerClose] 注销关闭钩子: ${name}`);
  }
}

function createTimeoutRace<T>(timeoutMs: number, onTimeout: () => T): {
  promise: Promise<T>;
  clear: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resolve: (value: T) => void;

  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });

  timer = setTimeout(() => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    resolve(onTimeout());
  }, timeoutMs);

  const unref = (timer as { unref?: () => void }).unref;
  if (typeof unref === 'function') {
    unref.call(timer);
  }

  return {
    promise,
    clear() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

async function runShutdownHook(hook: ShutdownHook): Promise<string | null> {
  const timeoutMs = hook.timeoutMs ?? GATEWAY_SHUTDOWN_HOOK_TIMEOUT_MS;
  const timeout = createTimeoutRace(timeoutMs, () => null);

  try {
    await Promise.race([
      hook.fn(),
      timeout.promise.then(() => null),
    ]);
    timeout.clear();
    return null;
  } catch (err) {
    timeout.clear();
    return `${hook.name}: ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function closeHttpServer(server: { close: (cb?: () => void) => void }): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve('HTTP 服务器关闭超时');
    }, HTTP_CLOSE_FORCE_WAIT_MS);

    server.close(() => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

async function closeWsServer(server: { close: (cb?: () => void) => void }): Promise<string | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve('WebSocket 服务器关闭超时');
    }, WEBSOCKET_CLOSE_GRACE_MS);

    server.close(() => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

export async function shutdownServer(handles?: ServerCloseHandles): Promise<ShutdownResult> {
  if (isShuttingDown) {
    logger.warn('[ServerClose] 服务器正在关闭中，跳过重复调用');
    return { durationMs: 0, warnings: ['已在关闭中'] };
  }

  isShuttingDown = true;
  const startTime = Date.now();
  const warnings: string[] = [];

  logger.info('[ServerClose] 开始服务器关闭流程');
  await publishEvent('system:shutdown', { startTime }, { level: 'info' });

  // 1. 执行关闭钩子
  for (const hook of shutdownHooks) {
    const warning = await runShutdownHook(hook);
    if (warning) {
      warnings.push(warning);
      logger.warn(`[ServerClose] 关闭钩子警告: ${warning}`);
    }
  }

  // 2. 关闭 WebSocket 服务器
  if (handles?.wsServer) {
    const wsWarning = await closeWsServer(handles.wsServer);
    if (wsWarning) {
      warnings.push(wsWarning);
    }
    logger.info('[ServerClose] WebSocket 服务器已关闭');
  }

  // 3. 关闭 HTTP 服务器
  if (handles?.httpServer) {
    const httpWarning = await closeHttpServer(handles.httpServer);
    if (httpWarning) {
      warnings.push(httpWarning);
    }
    logger.info('[ServerClose] HTTP 服务器已关闭');
  }

  // 4. 清理资源
  shutdownHooks.length = 0;

  const durationMs = Date.now() - startTime;
  logger.info(`[ServerClose] 服务器关闭完成 (${durationMs}ms, ${warnings.length} 警告)`);

  return { durationMs, warnings };
}

export function isServerShuttingDown(): boolean {
  return isShuttingDown;
}

export function resetShutdownState(): void {
  isShuttingDown = false;
  shutdownHooks.length = 0;
}