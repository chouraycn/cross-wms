/**
 * 诊断追踪与事件 — 参考 OpenClaw infra/diagnostic-trace-context.ts
 *
 * 提供分布式追踪和诊断事件功能。
 */

import { logger } from '../logger.js';

export interface DiagnosticTraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  startTime: number;
  attributes?: Record<string, unknown>;
}

export interface DiagnosticEvent {
  id: string;
  type: string;
  timestamp: number;
  traceId?: string;
  spanId?: string;
  data?: Record<string, unknown>;
  level: 'debug' | 'info' | 'warning' | 'error' | 'critical';
}

export interface TimingSpan {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  traceId?: string;
  attributes?: Record<string, unknown>;
}

const activeTraces = new Map<string, DiagnosticTraceContext>();
const pendingSpans = new Map<string, TimingSpan>();
const diagnosticEvents: DiagnosticEvent[] = [];

export function generateTraceId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateSpanId(): string {
  return Math.random().toString(36).substr(2, 9);
}

export function createTrace(attributes?: Record<string, unknown>): DiagnosticTraceContext {
  const traceId = generateTraceId();
  const spanId = generateSpanId();

  const context: DiagnosticTraceContext = {
    traceId,
    spanId,
    startTime: Date.now(),
    attributes,
  };

  activeTraces.set(traceId, context);

  logger.debug(`[Diagnostics] 创建追踪: ${traceId}`);

  return context;
}

export function createChildSpan(parentContext: DiagnosticTraceContext, name?: string): DiagnosticTraceContext {
  const spanId = generateSpanId();

  const context: DiagnosticTraceContext = {
    traceId: parentContext.traceId,
    spanId,
    parentSpanId: parentContext.spanId,
    startTime: Date.now(),
    attributes: {
      ...parentContext.attributes,
      spanName: name,
    },
  };

  return context;
}

export function startTimingSpan(name: string, traceId?: string): string {
  const spanId = generateSpanId();

  const span: TimingSpan = {
    id: spanId,
    name,
    startTime: Date.now(),
    traceId,
  };

  pendingSpans.set(spanId, span);

  return spanId;
}

export function endTimingSpan(spanId: string, attributes?: Record<string, unknown>): TimingSpan | null {
  const span = pendingSpans.get(spanId);
  if (!span) {
    return null;
  }

  const now = Date.now();
  span.endTime = now;
  span.durationMs = now - span.startTime;
  span.attributes = attributes;

  pendingSpans.delete(spanId);

  logger.debug(`[Diagnostics] 计时完成: ${span.name} (${span.durationMs}ms)`);

  return span;
}

export function emitDiagnosticEvent(type: string, data?: Record<string, unknown>, level: DiagnosticEvent['level'] = 'info'): void {
  const event: DiagnosticEvent = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    timestamp: Date.now(),
    data,
    level,
  };

  diagnosticEvents.push(event);

  if (diagnosticEvents.length > 1000) {
    diagnosticEvents.shift();
  }

  switch (level) {
    case 'error':
    case 'critical':
      logger.error(`[DiagnosticEvent] ${type}`, data);
      break;
    case 'warning':
      logger.warn(`[DiagnosticEvent] ${type}`, data);
      break;
    default:
      logger.debug(`[DiagnosticEvent] ${type}`, data);
  }
}

export function getDiagnosticEvents(limit: number = 100): DiagnosticEvent[] {
  return diagnosticEvents.slice(-limit);
}

export function getTrace(traceId: string): DiagnosticTraceContext | undefined {
  return activeTraces.get(traceId);
}

export function finishTrace(traceId: string): void {
  activeTraces.delete(traceId);
  logger.debug(`[Diagnostics] 完成追踪: ${traceId}`);
}

export function clearDiagnosticEvents(): void {
  diagnosticEvents.length = 0;
  logger.info('[Diagnostics] 清空诊断事件');
}

export async function runWithTrace<T>(
  fn: () => Promise<T>,
  options?: { name?: string; attributes?: Record<string, unknown> },
): Promise<{ result: T; traceId: string }> {
  const trace = createTrace(options?.attributes);
  const spanId = startTimingSpan(options?.name ?? 'operation', trace.traceId);

  try {
    const result = await fn();
    endTimingSpan(spanId);
    return { result, traceId: trace.traceId };
  } catch (err) {
    endTimingSpan(spanId, { error: err instanceof Error ? err.message : String(err) });
    throw err;
  } finally {
    finishTrace(trace.traceId);
  }
}