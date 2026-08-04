import { logger } from '../../logger.js';

export interface AbortSignalOptions {
  timeoutMs?: number;
  onAbort?: () => void;
}

export function createAbortSignal(options: AbortSignalOptions = {}): AbortController {
  const controller = new AbortController();
  
  if (options.timeoutMs && options.timeoutMs > 0) {
    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        logger.debug(`[infra:Abort] Timed out after ${options.timeoutMs}ms`);
        controller.abort();
      }
    }, options.timeoutMs);
    
    controller.signal.addEventListener('abort', () => {
      clearTimeout(timeoutId);
    });
  }
  
  if (options.onAbort) {
    controller.signal.addEventListener('abort', options.onAbort);
  }
  
  return controller;
}

export function createCombinedAbortSignal(signals: AbortSignal[]): AbortController {
  const controller = new AbortController();
  
  const onAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };
  
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller;
    }
    signal.addEventListener('abort', onAbort);
  }
  
  controller.signal.addEventListener('abort', () => {
    for (const signal of signals) {
      signal.removeEventListener('abort', onAbort);
    }
  });
  
  return controller;
}

export function isAborted(signal?: AbortSignal): boolean {
  return signal?.aborted ?? false;
}

export function assertNotAborted(signal?: AbortSignal): void {
  if (isAborted(signal)) {
    throw new Error('Operation aborted');
  }
}

/** Resolves when the signal aborts, or immediately when no wait is needed. */
export async function waitForAbortSignal(signal?: AbortSignal): Promise<void> {
  if (!signal || signal.aborted) {
    return;
  }
  await new Promise<void>((resolve) => {
    const onAbort = () => {
      // Remove explicitly even with `{ once: true }`; tests use foreign
      // AbortSignal-like objects, and cleanup must stay deterministic there.
      signal.removeEventListener("abort", onAbort);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}