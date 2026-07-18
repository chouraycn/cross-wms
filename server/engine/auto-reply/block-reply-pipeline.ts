import { logger } from '../../logger.js';
import type { ReplyPayload } from './types.js';

export type BlockReplyPipeline = {
  enqueue: (payload: ReplyPayload) => void;
  flush: (options?: { force?: boolean }) => Promise<void>;
  stop: () => void;
  hasBuffered: () => boolean;
  didStream: () => boolean;
  isAborted: () => boolean;
  getSentCount: () => number;
  getBufferedCount: () => number;
};

export type BlockReplyPipelineOptions = {
  deliver: (payload: ReplyPayload, info: { kind: 'block' | 'final' }) => Promise<void>;
  bufferMs?: number;
  maxBufferSize?: number;
  beforeDeliver?: (payload: ReplyPayload) => Promise<ReplyPayload | null> | ReplyPayload | null;
  deduplicate?: boolean;
};

type BufferedPayload = {
  payload: ReplyPayload;
  timestamp: number;
};

function createPayloadKey(payload: ReplyPayload): string {
  return JSON.stringify({
    text: payload.text,
    modelUsed: payload.modelUsed,
    error: payload.error,
    aborted: payload.aborted,
  });
}

export function createBlockReplyPipeline(
  options: BlockReplyPipelineOptions,
): BlockReplyPipeline {
  const bufferMs = options.bufferMs ?? 100;
  const maxBufferSize = options.maxBufferSize ?? 50;
  const buffer: BufferedPayload[] = [];
  const seenPayloads = new Set<string>();
  let sentCount = 0;
  let flushedCount = 0;
  let stopped = false;
  let aborted = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let flushing = false;

  function scheduleFlush(): void {
    if (flushTimer || stopped) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush();
    }, bufferMs);
  }

  async function flush(flushOpts: { force?: boolean } = {}): Promise<void> {
    if (stopped && !flushOpts.force) return;
    if (flushing) return;
    if (buffer.length === 0) return;

    flushing = true;
    try {
      while (buffer.length > 0) {
        const item = buffer.shift();
        if (!item) break;

        if (options.deduplicate) {
          const key = createPayloadKey(item.payload);
          if (seenPayloads.has(key)) continue;
          seenPayloads.add(key);
        }

        try {
          let payload = item.payload;
          if (options.beforeDeliver) {
            const processed = await options.beforeDeliver(payload);
            if (!processed) continue;
            payload = processed;
          }

          await options.deliver(payload, { kind: 'block' });
          sentCount++;
        } catch (err) {
          logger.error('[AutoReply] Block delivery failed:', err);
        }
      }
      flushedCount++;
    } finally {
      flushing = false;
    }
  }

  function enqueue(payload: ReplyPayload): void {
    if (stopped) return;

    buffer.push({
      payload,
      timestamp: Date.now(),
    });

    if (buffer.length >= maxBufferSize) {
      void flush({ force: true });
    } else {
      scheduleFlush();
    }
  }

  function stop(): void {
    stopped = true;
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  function abort(): void {
    aborted = true;
    stop();
    buffer.length = 0;
  }

  return {
    enqueue,
    flush,
    stop,
    hasBuffered: () => buffer.length > 0,
    didStream: () => sentCount > 0,
    isAborted: () => aborted,
    getSentCount: () => sentCount,
    getBufferedCount: () => buffer.length,
  };
}

export function coalesceReplyPayloads(payloads: ReplyPayload[]): ReplyPayload {
  if (payloads.length === 0) {
    return { text: '' };
  }

  if (payloads.length === 1) {
    return payloads[0];
  }

  const texts = payloads.map((p) => p.text).filter(Boolean);
  const last = payloads[payloads.length - 1];

  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheWrite = 0;
  let totalCostInput = 0;
  let totalCostOutput = 0;
  let totalCostTotal = 0;
  let hasUsage = false;

  for (const p of payloads) {
    if (p.usage) {
      hasUsage = true;
      totalInput += p.usage.input ?? 0;
      totalOutput += p.usage.output ?? 0;
      totalCacheRead += p.usage.cacheRead ?? 0;
      totalCacheWrite += p.usage.cacheWrite ?? 0;
      if (p.usage.cost) {
        totalCostInput += p.usage.cost.input ?? 0;
        totalCostOutput += p.usage.cost.output ?? 0;
        totalCostTotal += p.usage.cost.total ?? 0;
      }
    }
  }

  return {
    text: texts.join(''),
    sessionId: last.sessionId,
    modelUsed: last.modelUsed,
    error: last.error,
    aborted: last.aborted,
    ...(hasUsage
      ? {
          usage: {
            input: totalInput,
            output: totalOutput,
            cacheRead: totalCacheRead,
            cacheWrite: totalCacheWrite,
            cost: {
              input: totalCostInput,
              output: totalCostOutput,
              total: totalCostTotal,
            },
          },
        }
      : {}),
  };
}
