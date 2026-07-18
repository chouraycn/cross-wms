import { logger } from '../../logger.js';
import type {
  MailWatcherStatus,
  MailWatcherState,
  MailWatcherError,
  MailProviderType,
} from './types.js';

const WATCHER_STATUS_KEY = Symbol.for('cdf-know.mailWatcherStatus');

type MailWatcherStore = {
  status: MailWatcherStatus;
  listeners: Set<(status: MailWatcherStatus) => void>;
};

function getStore(): MailWatcherStore {
  const store = globalThis as Record<symbol, MailWatcherStore>;
  if (!store[WATCHER_STATUS_KEY]) {
    store[WATCHER_STATUS_KEY] = {
      status: {
        state: 'stopped',
        errorCount: 0,
        consecutiveErrors: 0,
        messagesProcessed: 0,
      },
      listeners: new Set(),
    };
  }
  return store[WATCHER_STATUS_KEY];
}

function notifyListeners(): void {
  const store = getStore();
  for (const listener of store.listeners) {
    try {
      listener({ ...store.status });
    } catch (err) {
      logger.error(`[hooks:WatcherLifecycle] Listener error: ${String(err)}`);
    }
  }
}

export function getMailWatcherStatus(): MailWatcherStatus {
  const store = getStore();
  return { ...store.status };
}

export function setMailWatcherState(state: MailWatcherState): void {
  const store = getStore();
  store.status.state = state;
  logger.debug(`[hooks:WatcherLifecycle] Watcher state changed: ${state}`);
  notifyListeners();
}

export function setMailWatcherAccount(account: string, provider?: MailProviderType): void {
  const store = getStore();
  store.status.account = account;
  store.status.provider = provider;
  notifyListeners();
}

export function recordMailWatcherError(error: Error | string, type?: string): void {
  const store = getStore();
  const message = error instanceof Error ? error.message : String(error);
  const mailError: MailWatcherError = {
    type: (type as MailWatcherError['type']) || 'unknown',
    message,
    timestamp: new Date(),
  };
  store.status.lastError = mailError;
  store.status.errorCount += 1;
  store.status.consecutiveErrors += 1;
  logger.error(`[hooks:WatcherLifecycle] Watcher error [${mailError.type}]: ${message}`);
  notifyListeners();
}

export function recordMailWatcherSuccess(): void {
  const store = getStore();
  store.status.lastCheck = new Date();
  store.status.consecutiveErrors = 0;
  notifyListeners();
}

export function recordMessageProcessed(): void {
  const store = getStore();
  store.status.messagesProcessed += 1;
  notifyListeners();
}

export function startMailWatcherStatusTracking(): void {
  const store = getStore();
  store.status.startedAt = new Date();
  store.status.state = 'starting';
  store.status.errorCount = 0;
  store.status.consecutiveErrors = 0;
  store.status.messagesProcessed = 0;
  store.status.lastError = undefined;
  notifyListeners();
}

export function stopMailWatcherStatusTracking(): void {
  const store = getStore();
  store.status.state = 'stopped';
  store.status.account = undefined;
  store.status.provider = undefined;
  notifyListeners();
}

export function subscribeToMailWatcherStatus(
  listener: (status: MailWatcherStatus) => void,
): () => void {
  const store = getStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

export function resetMailWatcherStatusForTest(): void {
  const store = getStore();
  store.status = {
    state: 'stopped',
    errorCount: 0,
    consecutiveErrors: 0,
    messagesProcessed: 0,
  };
  store.listeners.clear();
}

export type MailWatcherLog = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export async function startMailWatcherWithLogs(params: {
  startFn: () => Promise<{ started: boolean; reason?: string }>;
  log: MailWatcherLog;
  onSkipped?: () => void;
  skipEnvVar?: string;
  isCancelled?: () => boolean;
  signal?: AbortSignal;
}): Promise<void> {
  if (params.skipEnvVar && process.env[params.skipEnvVar]) {
    params.onSkipped?.();
    return;
  }

  try {
    const result = await params.startFn();
    if (result.started) {
      params.log.info('mail watcher started');
      return;
    }
    if (
      result.reason &&
      result.reason !== 'hooks not enabled' &&
      result.reason !== 'no mail account configured'
    ) {
      params.log.warn(`mail watcher not started: ${result.reason}`);
    }
  } catch (err) {
    params.log.error(`mail watcher failed to start: ${String(err)}`);
  }
}
