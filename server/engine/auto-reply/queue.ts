export type QueueMode = 'off' | 'serial' | 'parallel';
export type QueueDropPolicy = 'drop-oldest' | 'drop-newest' | 'reject';
export type QueueDedupeMode = 'off' | 'exact';

export type QueueSettings = {
  mode: QueueMode;
  maxDepth?: number;
  dropPolicy?: QueueDropPolicy;
  dedupe?: QueueDedupeMode;
};

export function extractQueueDirective(body?: string): {
  cleaned: string;
  queueMode?: QueueMode;
  hasDirective: boolean;
} {
  if (!body) return { cleaned: '', hasDirective: false };

  const match = body.match(/(?:^|\s)\/queue(?=$|\s|:)\s*:?\s*(off|serial|parallel)?/i);
  if (!match) return { cleaned: body.trim(), hasDirective: false };

  const rawMode = match[1]?.toLowerCase();
  const queueMode: QueueMode | undefined = (rawMode === 'off' || rawMode === 'serial' || rawMode === 'parallel')
    ? rawMode as QueueMode
    : 'serial';
  const cleaned = body.replace(match[0], ' ').replace(/\s+/g, ' ').trim();
  return { cleaned, queueMode, hasDirective: true };
}

export function resolveQueueSettings(config?: Partial<QueueSettings>): QueueSettings {
  return {
    mode: config?.mode ?? 'off',
    maxDepth: config?.maxDepth,
    dropPolicy: config?.dropPolicy,
    dedupe: config?.dedupe ?? 'off',
  };
}
