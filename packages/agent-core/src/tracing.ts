import type { TraceSpan } from './types';
import { v4 as uuidv4 } from 'uuid';

export class Tracer {
  private spans: Map<string, TraceSpan> = new Map();
  private activeSpans: string[] = [];
  private enabled = true;

  startSpan(
    name: string,
    attributes: Record<string, unknown> = {},
    parentId?: string,
  ): TraceSpan {
    const id = uuidv4();
    const span: TraceSpan = {
      id,
      name,
      parentId,
      startTime: Date.now(),
      attributes,
      events: [],
      status: 'running',
    };

    this.spans.set(id, span);
    this.activeSpans.push(id);
    return span;
  }

  endSpan(spanId: string, attributes: Record<string, unknown> = {}): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.attributes = { ...span.attributes, ...attributes };
    span.status = 'completed';

    const index = this.activeSpans.indexOf(spanId);
    if (index > -1) {
      this.activeSpans.splice(index, 1);
    }
  }

  failSpan(spanId: string, error: string): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.status = 'error';
    span.attributes = { ...span.attributes, error };
  }

  addEvent(
    spanId: string,
    name: string,
    attributes: Record<string, unknown> = {},
  ): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.events.push({
      name,
      timestamp: Date.now(),
      attributes,
    });
  }

  getSpan(spanId: string): TraceSpan | undefined {
    return this.spans.get(spanId);
  }

  getActiveSpans(): TraceSpan[] {
    return this.activeSpans.map((id) => this.spans.get(id)!).filter(Boolean);
  }

  getAllSpans(): TraceSpan[] {
    return Array.from(this.spans.values());
  }

  getCompletedSpans(): TraceSpan[] {
    return Array.from(this.spans.values()).filter((s) => s.status === 'completed');
  }

  export(): TraceSpan[] {
    return Array.from(this.spans.values());
  }

  clear(): void {
    this.spans.clear();
    this.activeSpans = [];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getSpanTree(spanId?: string): TraceSpan[] {
    const allSpans = Array.from(this.spans.values());

    if (!spanId) {
      return allSpans.filter((s) => !s.parentId);
    }

    return allSpans.filter((s) => s.parentId === spanId);
  }

  getDuration(spanId: string): number | undefined {
    const span = this.spans.get(spanId);
    if (!span || !span.endTime) return undefined;
    return span.endTime - span.startTime;
  }

  getTotalDuration(): number {
    const completed = this.getCompletedSpans();
    return completed.reduce((total, span) => {
      if (span.endTime) {
        return total + (span.endTime - span.startTime);
      }
      return total;
    }, 0);
  }
}

export const globalTracer = new Tracer();

export function trace<T>(
  name: string,
  fn: () => T | Promise<T>,
  attributes: Record<string, unknown> = {},
): Promise<T> {
  const tracer = globalTracer;
  const span = tracer.startSpan(name, attributes);

  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then((value) => {
          tracer.endSpan(span.id);
          return value;
        })
        .catch((error) => {
          tracer.failSpan(span.id, error.message);
          throw error;
        });
    }
    tracer.endSpan(span.id);
    return Promise.resolve(result);
  } catch (error) {
    tracer.failSpan(span.id, (error as Error).message);
    return Promise.reject(error);
  }
}
