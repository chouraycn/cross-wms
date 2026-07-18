import { logger } from '../../logger.js';
import { type MailHookRuntimeConfig, resolveMailHookRuntimeConfig } from './mail.js';
import { MailClient, type MailMessage } from './mail-client.js';

export type MailWatcherStartResult = {
  started: boolean;
  reason?: string;
};

export type MailWatcherStartOptions = {
  isCancelled?: () => boolean;
  signal?: AbortSignal;
  onNewMessage?: (message: MailMessage) => void;
};

let checkInterval: ReturnType<typeof setInterval> | null = null;
let respawnTimeout: ReturnType<typeof setTimeout> | null = null;
let shuttingDown = false;
let currentConfig: MailHookRuntimeConfig | null = null;
const lastCheckedUids: Set<number> = new Set();
let onNewMessageCallback: ((message: MailMessage) => void) | null = null;

type SimpleConfig = {
  hooks?: {
    enabled?: boolean;
    mail?: {
      account?: string;
    };
  };
};

async function checkForNewMessages(config: MailHookRuntimeConfig): Promise<void> {
  if (shuttingDown) return;

  const client = new MailClient(config);

  try {
    await client.connectIMAP();
    await client.selectMailbox(config.label);

    const response = await client.sendIMAPCommand('SEARCH UNSEEN');
    const match = response.match(/SEARCH\s+(.+)/);

    if (match) {
      const uids = match[1].split(' ').filter(Boolean).map(Number);

      for (const uid of uids) {
        if (!lastCheckedUids.has(uid)) {
          lastCheckedUids.add(uid);

          const message = await client.fetchMessage(uid);
          if (message) {
            logger.info(`[MailWatcher] New message from ${message.from}: ${message.subject}`);

            if (onNewMessageCallback) {
              try {
                onNewMessageCallback(message);
              } catch (err) {
                logger.error(`[MailWatcher] Error invoking onNewMessage callback: ${String(err)}`);
              }
            }

            if (config.includeBody) {
              await client.markAsRead(uid);
            }
          }
        }
      }
    }

    await client.disconnectIMAP();
  } catch (err) {
    logger.error(`[MailWatcher] Error checking for new messages: ${String(err)}`);
    try {
      await client.disconnectIMAP();
    } catch {
      // ignore
    }
  }
}

function cancelledMailWatcherStart(expectedConfig: MailHookRuntimeConfig): MailWatcherStartResult {
  if (currentConfig === expectedConfig) {
    currentConfig = null;
  }
  return { started: false, reason: 'startup cancelled' };
}

function isMailWatcherStartCancelled(options: MailWatcherStartOptions): boolean {
  return options.signal?.aborted === true || options.isCancelled?.() === true;
}

function createMailWatcherCancellation(
  options: MailWatcherStartOptions,
): { dispose: () => void; isCancelled: () => boolean; signal?: AbortSignal } {
  if (!options.signal && !options.isCancelled) {
    return {
      dispose: () => {},
      isCancelled: () => false,
    };
  }

  const abortController = new AbortController();
  const abort = () => {
    if (!abortController.signal.aborted) {
      abortController.abort();
    }
  };
  const onAbort = () => abort();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  let cancelPoll: ReturnType<typeof setInterval> | null = null;
  if (options.isCancelled) {
    cancelPoll = setInterval(() => {
      if (options.isCancelled?.()) {
        abort();
      }
    }, 100);
    cancelPoll.unref?.();
  }

  if (isMailWatcherStartCancelled(options)) {
    abort();
  }

  return {
    dispose: () => {
      if (cancelPoll) {
        clearInterval(cancelPoll);
        cancelPoll = null;
      }
      options.signal?.removeEventListener('abort', onAbort);
    },
    isCancelled: () => abortController.signal.aborted || isMailWatcherStartCancelled(options),
    signal: abortController.signal,
  };
}

export async function startMailWatcher(
  cfg: SimpleConfig,
  options: MailWatcherStartOptions = {},
): Promise<MailWatcherStartResult> {
  if (!cfg.hooks?.enabled) {
    return { started: false, reason: 'hooks not enabled' };
  }

  if (!cfg.hooks?.mail?.account) {
    return { started: false, reason: 'no mail account configured' };
  }

  const resolved = resolveMailHookRuntimeConfig(cfg, {});
  if (!resolved.ok) {
    return { started: false, reason: resolved.error };
  }

  const runtimeConfig = resolved.value;
  if (isMailWatcherStartCancelled(options)) {
    return cancelledMailWatcherStart(runtimeConfig);
  }

  currentConfig = runtimeConfig;
  onNewMessageCallback = options.onNewMessage || null;

  if (checkInterval || respawnTimeout) {
    shuttingDown = true;
    if (respawnTimeout) {
      clearTimeout(respawnTimeout);
      respawnTimeout = null;
    }
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    shuttingDown = false;
  }

  const cancellation = createMailWatcherCancellation(options);
  try {
    await checkForNewMessages(runtimeConfig);

    if (cancellation.isCancelled()) {
      return cancelledMailWatcherStart(runtimeConfig);
    }
  } catch (err) {
    if (cancellation.isCancelled()) {
      return cancelledMailWatcherStart(runtimeConfig);
    }
    logger.error(`[MailWatcher] Initial mail check failed: ${String(err)}`);
    return {
      started: false,
      reason: `initial mail check failed: ${String(err)}`,
    };
  } finally {
    cancellation.dispose();
  }

  shuttingDown = false;
  checkInterval = setInterval(() => {
    if (shuttingDown) return;
    void checkForNewMessages(runtimeConfig);
  }, runtimeConfig.checkIntervalMs);

  logger.info(
    `[MailWatcher] mail watcher started for ${runtimeConfig.account} (check every ${runtimeConfig.checkIntervalMs}ms)`,
  );

  return { started: true };
}

export async function stopMailWatcher(): Promise<void> {
  shuttingDown = true;

  if (respawnTimeout) {
    clearTimeout(respawnTimeout);
    respawnTimeout = null;
  }
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }

  currentConfig = null;
  onNewMessageCallback = null;

  logger.info('[MailWatcher] mail watcher stopped');
}

export function setMailWatcherCallback(callback: (message: MailMessage) => void): void {
  onNewMessageCallback = callback;
}

export function clearMailWatcherCallback(): void {
  onNewMessageCallback = null;
}