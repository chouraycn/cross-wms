import { describe, it, expect } from 'vitest';
import { TraceContext, TRACE_HEADER_KEYS } from '../traceContext.js';

describe('logging > traceContext', () => {
  it('generates traceId and spanId by default', () => {
    const ctx = new TraceContext();
    expect(ctx.traceId).toBeDefined();
    expect(ctx.spanId).toBeDefined();
    expect(ctx.traceId.length).toBeGreaterThan(0);
    expect(ctx.spanId.length).toBeGreaterThan(0);
    expect(ctx.parentSpanId).toBeUndefined();
  });

  it('accepts custom traceId, spanId and parentSpanId', () => {
    const ctx = new TraceContext({
      traceId: 'custom-trace-123',
      spanId: 'custom-span-456',
      parentSpanId: 'parent-span-789',
    });
    expect(ctx.traceId).toBe('custom-trace-123');
    expect(ctx.spanId).toBe('custom-span-456');
    expect(ctx.parentSpanId).toBe('parent-span-789');
  });

  it('records startTime', () => {
    const before = Date.now();
    const ctx = new TraceContext();
    const after = Date.now();
    expect(ctx.startTime).toBeGreaterThanOrEqual(before);
    expect(ctx.startTime).toBeLessThanOrEqual(after);
  });

  it('supports tags', () => {
    const ctx = new TraceContext();
    ctx.setTag('service', 'test-service');
    ctx.setTag('env', 'test');
    expect(ctx.getTag('service')).toBe('test-service');
    expect(ctx.getTag('env')).toBe('test');
    expect(ctx.getTag('missing')).toBeUndefined();
    expect(ctx.getTags()).toEqual({ service: 'test-service', env: 'test' });
  });

  it('returns tags copy to prevent external mutation', () => {
    const ctx = new TraceContext();
    ctx.setTag('key', 'value');
    const tags = ctx.getTags();
    tags.key = 'mutated';
    expect(ctx.getTag('key')).toBe('value');
  });

  it('serializes to headers', () => {
    const ctx = new TraceContext({
      traceId: 'trace-abc',
      spanId: 'span-def',
      parentSpanId: 'parent-ghi',
    });
    const headers = ctx.toHeaders();
    expect(headers[TRACE_HEADER_KEYS.TRACE_ID]).toBe('trace-abc');
    expect(headers[TRACE_HEADER_KEYS.SPAN_ID]).toBe('span-def');
    expect(headers[TRACE_HEADER_KEYS.PARENT_SPAN_ID]).toBe('parent-ghi');
  });

  it('omits parentSpanId from headers when absent', () => {
    const ctx = new TraceContext({ traceId: 't', spanId: 's' });
    const headers = ctx.toHeaders();
    expect(headers[TRACE_HEADER_KEYS.PARENT_SPAN_ID]).toBeUndefined();
  });

  it('restores from headers', () => {
    const headers = {
      [TRACE_HEADER_KEYS.TRACE_ID]: 'restored-trace',
      [TRACE_HEADER_KEYS.SPAN_ID]: 'restored-span',
      [TRACE_HEADER_KEYS.PARENT_SPAN_ID]: 'restored-parent',
    };
    const ctx = TraceContext.fromHeaders(headers);
    expect(ctx.traceId).toBe('restored-trace');
    expect(ctx.spanId).toBe('restored-span');
    expect(ctx.parentSpanId).toBe('restored-parent');
  });

  it('restores from array headers', () => {
    const headers = {
      [TRACE_HEADER_KEYS.TRACE_ID]: ['array-trace'],
      [TRACE_HEADER_KEYS.SPAN_ID]: ['array-span'],
    };
    const ctx = TraceContext.fromHeaders(headers);
    expect(ctx.traceId).toBe('array-trace');
    expect(ctx.spanId).toBe('array-span');
  });

  it('creates child span with same traceId and current spanId as parent', () => {
    const parent = new TraceContext({ traceId: 'same-trace', spanId: 'parent-span' });
    const child = parent.createChildSpan('child-operation');
    expect(child.traceId).toBe(parent.traceId);
    expect(child.parentSpanId).toBe(parent.spanId);
    expect(child.spanId).not.toBe(parent.spanId);
    expect(child.getTag('spanName')).toBe('child-operation');
  });

  it('inherits tags in child span', () => {
    const parent = new TraceContext({ tags: { region: 'ap-east' } });
    const child = parent.createChildSpan();
    expect(child.getTag('region')).toBe('ap-east');
  });
});
