import { z } from 'zod';
import { logger } from '../../logger.js';

export const TraceEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.number(),
  durationMs: z.number().default(0),
  status: z.enum(['start', 'success', 'error', 'warning', 'info']).default('info'),
  message: z.string().default(''),
  data: z.record(z.string(), z.unknown()).default({}),
  parentId: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type TraceEvent = z.infer<typeof TraceEventSchema>;

const eventStore: TraceEvent[] = [];
const maxEvents = 10000;
const activeSpans = new Map<string, TraceEvent>();

type TraceEventHandler = (event: TraceEvent) => void;
const handlers: TraceEventHandler[] = [];

export function startTraceSpan(params: {
  type: string;
  agentId?: string;
  sessionId?: string;
  message?: string;
  data?: Record<string, unknown>;
  parentId?: string;
  tags?: string[];
}): string {
  const id = generateTraceId();
  const event: TraceEvent = {
    id,
    type: params.type,
    agentId: params.agentId,
    sessionId: params.sessionId,
    timestamp: Date.now(),
    durationMs: 0,
    status: 'start',
    message: params.message ?? '',
    data: params.data ?? {},
    parentId: params.parentId,
    tags: params.tags ?? [],
  };

  activeSpans.set(id, event);
  emitEvent(event);
  
  logger.debug(`[Agents:TraceBase] Start span: ${id} (${params.type})`);
  return id;
}

export function endTraceSpan(
  spanId: string,
  status: 'success' | 'error' = 'success',
  message?: string,
  data?: Record<string, unknown>,
): void {
  const span = activeSpans.get(spanId);
  if (!span) return;

  span.status = status;
  span.durationMs = Date.now() - span.timestamp;
  if (message) span.message = message;
  if (data) span.data = { ...span.data, ...data };

  activeSpans.delete(spanId);
  emitEvent({ ...span });
  
  logger.debug(`[Agents:TraceBase] End span: ${spanId} (${status}, ${span.durationMs}ms)`);
}

export function recordTraceEvent(params: {
  type: string;
  agentId?: string;
  sessionId?: string;
  status?: TraceEvent['status'];
  message?: string;
  data?: Record<string, unknown>;
  tags?: string[];
}): void {
  const event: TraceEvent = {
    id: generateTraceId(),
    type: params.type,
    agentId: params.agentId,
    sessionId: params.sessionId,
    timestamp: Date.now(),
    durationMs: 0,
    status: params.status ?? 'info',
    message: params.message ?? '',
    data: params.data ?? {},
    tags: params.tags ?? [],
  };

  emitEvent(event);
}

function emitEvent(event: TraceEvent): void {
  eventStore.push(event);
  
  if (eventStore.length > maxEvents) {
    eventStore.shift();
  }

  for (const handler of handlers) {
    try {
      handler(event);
    } catch (err) {
      logger.error('[Agents:TraceBase] Handler error:', err);
    }
  }
}

export function getTraceEvents(filter?: {
  agentId?: string;
  sessionId?: string;
  type?: string;
  status?: TraceEvent['status'];
  limit?: number;
}): TraceEvent[] {
  let events = [...eventStore];

  if (filter?.agentId) {
    events = events.filter(e => e.agentId === filter.agentId);
  }

  if (filter?.sessionId) {
    events = events.filter(e => e.sessionId === filter.sessionId);
  }

  if (filter?.type) {
    events = events.filter(e => e.type === filter.type);
  }

  if (filter?.status) {
    events = events.filter(e => e.status === filter.status);
  }

  if (filter?.limit) {
    events = events.slice(-filter.limit);
  }

  return events;
}

export function getActiveSpanCount(): number {
  return activeSpans.size;
}

export function onTraceEvent(handler: TraceEventHandler): () => void {
  handlers.push(handler);
  return () => {
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  };
}

export function clearTraceEvents(): void {
  eventStore.length = 0;
  activeSpans.clear();
}

export function getTraceStats(): {
  total: number;
  success: number;
  error: number;
  active: number;
} {
  let success = 0;
  let error = 0;

  for (const event of eventStore) {
    if (event.status === 'success') success++;
    if (event.status === 'error') error++;
  }

  return {
    total: eventStore.length,
    success,
    error,
    active: activeSpans.size,
  };
}

function generateTraceId(): string {
  return `trace-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export async function withTrace<T>(
  params: {
    type: string;
    agentId?: string;
    sessionId?: string;
    message?: string;
    data?: Record<string, unknown>;
    tags?: string[];
  },
  fn: () => T | Promise<T>,
): Promise<T> {
  const spanId = startTraceSpan(params);
  
  try {
    const result = fn();
    if (result instanceof Promise) {
      const value = await result;
      endTraceSpan(spanId, 'success');
      return value;
    }
    endTraceSpan(spanId, 'success');
    return result;
  } catch (err) {
    endTraceSpan(spanId, 'error', err instanceof Error ? err.message : String(err));
    throw err;
  }
}

logger.debug('[Agents:TraceBase] Module loaded');
