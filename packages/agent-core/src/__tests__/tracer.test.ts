import { describe, it, expect } from 'vitest';
import { Tracer, globalTracer, trace } from '../tracing';

describe('Tracer', () => {
  it('should start and end a span', () => {
    const tracer = new Tracer();
    const span = tracer.startSpan('op');
    expect(span.status).toBe('running');
    expect(tracer.getActiveSpans().length).toBe(1);
    tracer.endSpan(span.id);
    const ended = tracer.getSpan(span.id);
    expect(ended?.status).toBe('completed');
    expect(ended?.endTime).toBeDefined();
    expect(tracer.getActiveSpans().length).toBe(0);
  });

  it('should fail a span', () => {
    const tracer = new Tracer();
    const span = tracer.startSpan('op');
    tracer.failSpan(span.id, 'boom');
    expect(tracer.getSpan(span.id)?.status).toBe('error');
    expect(tracer.getSpan(span.id)?.attributes.error).toBe('boom');
  });

  it('should no-op on unknown span ids', () => {
    const tracer = new Tracer();
    expect(() => tracer.endSpan('nope')).not.toThrow();
    expect(() => tracer.failSpan('nope', 'x')).not.toThrow();
    expect(tracer.getSpan('nope')).toBeUndefined();
  });

  it('should record events on a span', () => {
    const tracer = new Tracer();
    const span = tracer.startSpan('op');
    tracer.addEvent(span.id, 'checkpoint', { step: 1 });
    expect(tracer.getSpan(span.id)?.events.length).toBe(1);
  });

  it('should build span tree by parentId', () => {
    const tracer = new Tracer();
    const root = tracer.startSpan('root');
    const child = tracer.startSpan('child', {}, root.id);
    tracer.endSpan(child.id);
    tracer.endSpan(root.id);
    expect(tracer.getSpanTree().length).toBe(1);
    expect(tracer.getSpanTree(root.id).length).toBe(1);
  });

  it('should compute duration and total duration', () => {
    const tracer = new Tracer();
    const span = tracer.startSpan('op');
    tracer.endSpan(span.id);
    expect(typeof tracer.getDuration(span.id)).toBe('number');
    expect(tracer.getTotalDuration()).toBeGreaterThanOrEqual(0);
  });

  it('should support enable/disable and clear', () => {
    const tracer = new Tracer();
    tracer.setEnabled(false);
    expect(tracer.isEnabled()).toBe(false);
    tracer.setEnabled(true);
    tracer.startSpan('a');
    tracer.clear();
    expect(tracer.getAllSpans().length).toBe(0);
  });

  it('should export spans', () => {
    const tracer = new Tracer();
    tracer.startSpan('a');
    expect(tracer.export().length).toBe(1);
  });

  it('globalTracer should be a singleton Tracer', () => {
    expect(globalTracer).toBeInstanceOf(Tracer);
  });

  it('trace() should wrap sync and async functions', async () => {
    const syncResult = await trace('sync', () => 42);
    expect(syncResult).toBe(42);
    const asyncResult = await trace('async', async () => 'ok');
    expect(asyncResult).toBe('ok');
    const failed = trace('fail', () => { throw new Error('e'); });
    await expect(failed).rejects.toThrow('e');
    expect(globalTracer.getCompletedSpans().length).toBeGreaterThan(0);
  });
});
