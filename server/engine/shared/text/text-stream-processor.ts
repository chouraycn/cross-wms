import {
  createTextCoalescer,
  type TextCoalescer,
  type TextCoalescerOptions,
  type TextStreamKind,
} from './text-coalescer.js';
import {
  createReasoningTagTextPartitioner,
  type ReasoningTagTextPartitioner,
  type ReasoningTagTextDelta,
} from './reasoning-tag-text-partitioner.js';

export interface TextStreamProcessorOptions {
  coalesce?: TextCoalescerOptions;
}

export type TextStreamProcessorFlushHandler = (
  kind: TextStreamKind,
  mergedText: string,
) => void;

export interface TextStreamProcessor {
  pushText(text: string): void;
  pushThinking(text: string): void;
  forceFlush(): void;
  hasPendingPartitioner(): boolean;
  hasPendingCoalescer(): boolean;
  stop(): void;
}

export function createTextStreamProcessor(
  handler: TextStreamProcessorFlushHandler,
  options?: TextStreamProcessorOptions,
): TextStreamProcessor {
  const partitioner: ReasoningTagTextPartitioner = createReasoningTagTextPartitioner();

  const coalesceEnabled = options?.coalesce !== undefined;
  const coalescer: TextCoalescer | null = coalesceEnabled
    ? createTextCoalescer(handler, options!.coalesce)
    : null;

  const pushText = (text: string) => {
    if (!text) return;
    const deltas: ReasoningTagTextDelta[] = partitioner.push(text);
    for (const delta of deltas) {
      const kind: TextStreamKind = delta.kind === 'text' ? 'assistant' : 'thinking';
      if (coalescer) {
        coalescer.push(kind, delta.text);
      } else {
        handler(kind, delta.text);
      }
    }
  };

  const pushThinking = (text: string) => {
    if (!text) return;
    if (coalescer) {
      coalescer.push('thinking', text);
    } else {
      handler('thinking', text);
    }
  };

  const forceFlush = () => {
    const deltas = partitioner.flush();
    for (const delta of deltas) {
      const kind: TextStreamKind = delta.kind === 'text' ? 'assistant' : 'thinking';
      if (coalescer) {
        coalescer.push(kind, delta.text);
      } else {
        handler(kind, delta.text);
      }
    }
    coalescer?.forceFlush();
  };

  const hasPendingPartitioner = () => partitioner.hasPending();
  const hasPendingCoalescer = () => coalescer?.hasPending() ?? false;

  const stop = () => {
    coalescer?.stop();
  };

  return {
    pushText,
    pushThinking,
    forceFlush,
    hasPendingPartitioner,
    hasPendingCoalescer,
    stop,
  };
}
