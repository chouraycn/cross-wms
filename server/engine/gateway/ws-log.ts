import { logger } from '../../logger.js';

const LOG_VALUE_LIMIT = 240;
const DEFAULT_WS_SLOW_MS = 1_000;

const wsInflightCompact = new Map<string, number>();
const wsInflightSince = new Map<string, number>();

const WS_META_SKIP_KEYS = new Set(['connId', 'id', 'method', 'ok', 'event']);

let verboseMode = false;
let wsLogStyle: 'compact' | 'optimized' | 'auto' = 'auto';

export function setVerboseMode(enabled: boolean): void {
  verboseMode = enabled;
}

export function setWsLogStyle(style: 'compact' | 'optimized' | 'auto'): void {
  wsLogStyle = style;
}

export function shouldLogWs(): boolean {
  return verboseMode || wsLogStyle === 'compact';
}

export function shortId(value: string): string {
  if (value.length <= 24) return value;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return value.slice(0, 8) + '…' + value.slice(-4);
  }
  return value.slice(0, 12) + '…' + value.slice(-4);
}

export function formatForLog(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value.length > LOG_VALUE_LIMIT ? value.slice(0, LOG_VALUE_LIMIT) + '...' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Error) {
    const chain: string[] = [];
    let current: unknown = value;
    let depth = 0;
    while (current instanceof Error && depth < 8) {
      chain.push(current.message);
      current = (current as { cause?: unknown }).cause;
      depth++;
    }
    return chain.join(' <- ');
  }
  try {
    const json = JSON.stringify(value);
    return json.length > LOG_VALUE_LIMIT ? json.slice(0, LOG_VALUE_LIMIT) + '...' : json;
  } catch {
    return '[object]';
  }
}

export function compactPreview(input: string, maxLen = 160): string {
  const single = input.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
  return single.length > maxLen ? single.slice(0, maxLen - 3) + '...' : single;
}

function buildWsHeadline(method: string): string {
  return method;
}

function buildWsStatusToken(ok: boolean | undefined): string {
  if (ok === undefined) return '';
  return ok ? '✓' : '✗';
}

function collectWsRestMeta(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (WS_META_SKIP_KEYS.has(key)) continue;
    parts.push(`${key}=${formatForLog(value)}`);
  }
  return parts.join(' ');
}

export function logWs(
  direction: 'in' | 'out',
  kind: 'req' | 'res' | 'event' | 'conn' | 'parse-error',
  meta: Record<string, unknown>,
): void {
  if (!shouldLogWs() && kind !== 'parse-error') {
    if (wsLogStyle === 'optimized' && kind === 'res') {
      const ok = meta.ok as boolean | undefined;
      const connId = meta.connId as string | undefined;
      const id = meta.id as string | undefined;
      const key = connId && id ? `${connId}:${id}` : '';
      const startTime = key ? wsInflightSince.get(key) : undefined;
      if (startTime) {
        const duration = Date.now() - startTime;
        wsInflightSince.delete(key);
        if (ok === false || duration >= DEFAULT_WS_SLOW_MS) {
          const method = meta.method as string ?? '';
          const rest = collectWsRestMeta(meta);
          logger.info(`[WS] ${buildWsHeadline(method)} ${buildWsStatusToken(ok)} ${duration}ms ${rest}`);
        }
      }
      if (wsInflightSince.size > 2000) wsInflightSince.clear();
    }
    return;
  }

  if (kind === 'parse-error') {
    logger.warn(`[WS] parse-error: ${formatForLog(meta)}`);
    return;
  }

  const method = meta.method as string ?? meta.event as string ?? '';
  const ok = meta.ok as boolean | undefined;
  const connId = meta.connId as string | undefined;
  const id = meta.id as string | undefined;

  if (wsLogStyle === 'compact' || (wsLogStyle === 'auto' && verboseMode)) {
    if (kind === 'req') {
      const key = connId && id ? `${connId}:${id}` : '';
      if (key) wsInflightSince.set(key, Date.now());
      const arrow = direction === 'in' ? '←' : '→';
      logger.info(`[WS] ${arrow} ${shortId(connId ?? '')} ${method}`);
    } else if (kind === 'res') {
      const key = connId && id ? `${connId}:${id}` : '';
      const startTime = key ? wsInflightSince.get(key) : undefined;
      const duration = startTime ? Date.now() - startTime : 0;
      if (key) wsInflightSince.delete(key);
      const arrow = direction === 'in' ? '←' : '→';
      const status = buildWsStatusToken(ok);
      const rest = collectWsRestMeta(meta);
      logger.info(`[WS] ${arrow} ${shortId(connId ?? '')} ${method} ${status} ${duration}ms ${rest}`);
    } else if (kind === 'event') {
      const arrow = direction === 'in' ? '←' : '→';
      logger.info(`[WS] ${arrow} ${shortId(connId ?? '')} event:${method}`);
    }
  }
}
