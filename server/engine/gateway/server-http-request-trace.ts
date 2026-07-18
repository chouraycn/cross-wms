import { logger } from '../../logger.js';
import type { HttpRequestLike, HttpResponseLike } from './http-common.js';

export type RequestTraceEntry = {
  requestId: string;
  timestamp: number;
  method: string;
  path: string;
  statusCode?: number;
  durationMs: number;
  clientIp?: string;
  userAgent?: string;
  authMethod?: string;
  error?: string;
  requestSize?: number;
  responseSize?: number;
};

type TraceFilter = (entry: RequestTraceEntry) => boolean;

const MAX_TRACE_ENTRIES = 1000;
const traceEntries: RequestTraceEntry[] = [];
const traceFilters = new Set<TraceFilter>();

export function recordRequestTrace(entry: RequestTraceEntry): void {
  let shouldRecord = true;
  for (const filter of traceFilters) {
    if (!filter(entry)) {
      shouldRecord = false;
      break;
    }
  }

  if (!shouldRecord) return;

  traceEntries.push(entry);

  if (traceEntries.length > MAX_TRACE_ENTRIES) {
    traceEntries.shift();
  }

  if (entry.error) {
    logger.warn(
      `[Gateway] Request trace: ${entry.method} ${entry.path} - ${entry.statusCode ?? 'error'} - ${entry.durationMs}ms - ${entry.error}`,
    );
  } else {
    logger.debug(
      `[Gateway] Request trace: ${entry.method} ${entry.path} - ${entry.statusCode ?? 200} - ${entry.durationMs}ms`,
    );
  }
}

export function getRequestTraces(options?: {
  limit?: number;
  offset?: number;
  method?: string;
  statusCode?: number;
  path?: string;
  since?: number;
  until?: number;
}): RequestTraceEntry[] {
  let result = [...traceEntries];

  if (options?.method) {
    result = result.filter((e) => e.method.toUpperCase() === options.method!.toUpperCase());
  }

  if (options?.statusCode !== undefined) {
    result = result.filter((e) => e.statusCode === options.statusCode);
  }

  if (options?.path) {
    result = result.filter((e) => e.path.includes(options.path!));
  }

  if (options?.since) {
    result = result.filter((e) => e.timestamp >= options.since!);
  }

  if (options?.until) {
    result = result.filter((e) => e.timestamp <= options.until!);
  }

  if (options?.offset) {
    result = result.slice(options.offset);
  }

  if (options?.limit) {
    result = result.slice(0, options.limit);
  }

  return result.reverse();
}

export function getRequestTraceStats(): {
  totalRequests: number;
  totalErrors: number;
  averageDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  requestsPerMinute: number;
  statusCodes: Record<number, number>;
} {
  const totalRequests = traceEntries.length;
  const totalErrors = traceEntries.filter((e) => e.error).length;

  const durations = traceEntries.map((e) => e.durationMs).sort((a, b) => a - b);
  const averageDurationMs = durations.length > 0
    ? durations.reduce((sum, d) => sum + d, 0) / durations.length
    : 0;

  const percentile = (p: number): number => {
    if (durations.length === 0) return 0;
    const index = Math.floor((p / 100) * (durations.length - 1));
    return durations[index] ?? 0;
  };

  const now = Date.now();
  const oneMinuteAgo = now - 60000;
  const requestsPerMinute = traceEntries.filter((e) => e.timestamp >= oneMinuteAgo).length;

  const statusCodes: Record<number, number> = {};
  for (const entry of traceEntries) {
    if (entry.statusCode !== undefined) {
      statusCodes[entry.statusCode] = (statusCodes[entry.statusCode] ?? 0) + 1;
    }
  }

  return {
    totalRequests,
    totalErrors,
    averageDurationMs,
    p50DurationMs: percentile(50),
    p95DurationMs: percentile(95),
    p99DurationMs: percentile(99),
    requestsPerMinute,
    statusCodes,
  };
}

export function clearRequestTraces(): void {
  traceEntries.length = 0;
}

export function addTraceFilter(filter: TraceFilter): void {
  traceFilters.add(filter);
}

export function removeTraceFilter(filter: TraceFilter): boolean {
  return traceFilters.delete(filter);
}

export function traceRequest(
  req: HttpRequestLike,
  res: HttpResponseLike & { on?: (event: string, callback: () => void) => void },
  options?: {
    clientIp?: string;
    authMethod?: string;
  },
): () => RequestTraceEntry | undefined {
  const startTime = Date.now();
  const requestId = `trace_${startTime}_${Math.random().toString(36).slice(2, 8)}`;
  const method = req.method ?? 'GET';
  const path = req.url?.split('?')[0] ?? req.path ?? '/';
  const userAgent = typeof req.headers['user-agent'] === 'string'
    ? req.headers['user-agent']
    : undefined;

  let entry: RequestTraceEntry | undefined;

  const finish = () => {
    if (entry) return entry;

    const durationMs = Date.now() - startTime;
    entry = {
      requestId,
      timestamp: startTime,
      method,
      path,
      statusCode: res.statusCode,
      durationMs,
      clientIp: options?.clientIp,
      userAgent,
      authMethod: options?.authMethod,
    };

    recordRequestTrace(entry);
    return entry;
  };

  if (res.on) {
    res.on('finish', finish);
    res.on('close', finish);
  }

  return finish;
}
