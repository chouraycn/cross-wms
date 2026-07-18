import { logger } from '../../logger.js';
import type { ReplyPayload } from './types.js';

export type ReplyDispatcher = {
  deliver: (payload: ReplyPayload, info: { kind: 'block' | 'final' | 'tool' }) => Promise<void>;
  appendBeforeDeliver: (hook: BeforeDeliverHook) => void;
  prependBeforeDeliver: (hook: BeforeDeliverHook) => void;
  hasBuffered: () => boolean;
  stop: () => void;
};

export type BeforeDeliverHook = (
  payload: ReplyPayload,
  info: { kind: 'block' | 'final' | 'tool' },
) => Promise<ReplyPayload | null> | ReplyPayload | null;

export type DispatchOptions = {
  deliver: (payload: ReplyPayload, info: { kind: 'block' | 'final' | 'tool' }) => Promise<void>;
  beforeDeliver?: BeforeDeliverHook;
  bufferMs?: number;
};

type DispatchResult = {
  delivered: number;
  failed: number;
  cancelled: number;
};

const activeDispatches = new Map<string, number>();

export function createReplyDispatcher(options: DispatchOptions): ReplyDispatcher {
  const beforeDeliverHooks: BeforeDeliverHook[] = [];
  let stopped = false;
  let bufferedCount = 0;

  if (options.beforeDeliver) {
    beforeDeliverHooks.push(options.beforeDeliver);
  }

  async function runBeforeDeliverHooks(
    payload: ReplyPayload,
    info: { kind: 'block' | 'final' | 'tool' },
  ): Promise<ReplyPayload | null> {
    let current: ReplyPayload | null = payload;
    for (const hook of beforeDeliverHooks) {
      if (!current) return null;
      const result = await hook(current, info);
      current = result ? { ...current, ...result } : null;
    }
    return current;
  }

  async function deliver(
    payload: ReplyPayload,
    info: { kind: 'block' | 'final' | 'tool' },
  ): Promise<void> {
    if (stopped) return;
    bufferedCount++;
    try {
      const processed = await runBeforeDeliverHooks(payload, info);
      if (!processed) return;
      await options.deliver(processed, info);
    } catch (err) {
      logger.error('[AutoReply] Dispatch delivery failed:', err);
      throw err;
    } finally {
      bufferedCount--;
    }
  }

  return {
    deliver,
    appendBeforeDeliver: (hook) => beforeDeliverHooks.push(hook),
    prependBeforeDeliver: (hook) => beforeDeliverHooks.unshift(hook),
    hasBuffered: () => bufferedCount > 0,
    stop: () => {
      stopped = true;
    },
  };
}

export function getActiveDispatchCount(sessionKey?: string): number {
  if (!sessionKey) return 0;
  return activeDispatches.get(sessionKey) ?? 0;
}

export function incrementActiveDispatch(sessionKey: string): void {
  const current = activeDispatches.get(sessionKey) ?? 0;
  activeDispatches.set(sessionKey, current + 1);
}

export function decrementActiveDispatch(sessionKey: string): void {
  const current = activeDispatches.get(sessionKey) ?? 0;
  if (current <= 1) {
    activeDispatches.delete(sessionKey);
  } else {
    activeDispatches.set(sessionKey, current - 1);
  }
}

export async function dispatchReply(
  payload: ReplyPayload,
  dispatcher: ReplyDispatcher,
  kind: 'block' | 'final' | 'tool' = 'final',
): Promise<DispatchResult> {
  try {
    await dispatcher.deliver(payload, { kind });
    return { delivered: 1, failed: 0, cancelled: 0 };
  } catch {
    return { delivered: 0, failed: 1, cancelled: 0 };
  }
}

export function combineBeforeDeliverHooks(
  ...hooks: Array<BeforeDeliverHook | undefined>
): BeforeDeliverHook | undefined {
  const activeHooks = hooks.filter((hook): hook is BeforeDeliverHook => Boolean(hook));
  if (activeHooks.length === 0) return undefined;

  return async (payload, info) => {
    let current: ReplyPayload | null = payload;
    for (const hook of activeHooks) {
      if (!current) return null;
      const next = await hook(current, info);
      current = next ?? null;
    }
    return current;
  };
}
