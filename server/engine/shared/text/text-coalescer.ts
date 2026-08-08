export type TextStreamKind = 'assistant' | 'thinking';

export interface TextCoalescerOptions {
  minChars?: number;
  maxChars?: number;
  idleMs?: number;
  joiner?: string;
}

export type TextCoalescerFlushHandler = (
  kind: TextStreamKind,
  mergedText: string,
) => void;

export interface TextCoalescer {
  push(kind: TextStreamKind, text: string): void;
  forceFlush(): void;
  hasPending(): boolean;
  stop(): void;
}

export function createTextCoalescer(
  handler: TextCoalescerFlushHandler,
  options?: TextCoalescerOptions,
): TextCoalescer {
  const minChars = Math.max(1, Math.floor(options?.minChars ?? 200));
  const maxChars = Math.max(minChars, Math.floor(options?.maxChars ?? 1000));
  const idleMs = Math.max(0, Math.floor(options?.idleMs ?? 300));
  const joiner = options?.joiner ?? '';

  const buffers: Record<TextStreamKind, string> = {
    assistant: '',
    thinking: '',
  };
  const idleTimers: Record<TextStreamKind, NodeJS.Timeout | undefined> = {
    assistant: undefined,
    thinking: undefined,
  };
  let stopped = false;

  const clearIdleTimer = (kind: TextStreamKind) => {
    const timer = idleTimers[kind];
    if (!timer) return;
    clearTimeout(timer);
    idleTimers[kind] = undefined;
  };

  const scheduleIdleFlush = (kind: TextStreamKind) => {
    if (idleMs <= 0) return;
    clearIdleTimer(kind);
    idleTimers[kind] = setTimeout(() => {
      void flushKind(kind, false);
    }, idleMs);
  };

  const resetBuffer = (kind: TextStreamKind) => {
    buffers[kind] = '';
  };

  const flushKind = (kind: TextStreamKind, force: boolean) => {
    clearIdleTimer(kind);
    if (stopped) {
      resetBuffer(kind);
      return;
    }
    const text = buffers[kind];
    if (!text) return;
    if (!force && text.length < minChars) {
      scheduleIdleFlush(kind);
      return;
    }
    resetBuffer(kind);
    handler(kind, text);
  };

  const push = (kind: TextStreamKind, text: string) => {
    if (stopped) return;
    if (!text) return;

    const current = buffers[kind];
    const nextText = current ? `${current}${joiner}${text}` : text;

    if (nextText.length > maxChars) {
      if (current) {
        flushKind(kind, true);
        if (text.length >= maxChars) {
          handler(kind, text);
          return;
        }
        buffers[kind] = text;
        scheduleIdleFlush(kind);
        return;
      }
      handler(kind, text);
      return;
    }

    buffers[kind] = nextText;
    if (buffers[kind].length >= maxChars) {
      flushKind(kind, true);
      return;
    }
    scheduleIdleFlush(kind);
  };

  const forceFlush = () => {
    flushKind('assistant', true);
    flushKind('thinking', true);
  };

  const hasPending = () =>
    buffers.assistant.length > 0 || buffers.thinking.length > 0;

  const stop = () => {
    stopped = true;
    clearIdleTimer('assistant');
    clearIdleTimer('thinking');
  };

  return {
    push,
    forceFlush,
    hasPending,
    stop,
  };
}
