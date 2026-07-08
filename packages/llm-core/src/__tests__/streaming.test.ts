import { describe, it, expect } from 'vitest';
import { UsageTracker, streamToText, streamToArray, streamToBuffer } from '../streaming';
import type { LlmStreamEvent } from '../streaming';

async function* gen(events: LlmStreamEvent[]): AsyncGenerator<LlmStreamEvent> {
  for (const e of events) yield e;
}

describe('UsageTracker', () => {
  it('should accumulate usage and reset', () => {
    const t = new UsageTracker();
    t.addUsage({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
    t.addUsage({ promptTokens: 20, completionTokens: 10, totalTokens: 30 });
    expect(t.getTotal().totalTokens).toBe(45);
    t.reset();
    expect(t.getTotal().totalTokens).toBe(0);
  });

  it('should track optional usage fields', () => {
    const t = new UsageTracker();
    t.addUsage({ promptTokens: 1, completionTokens: 1, totalTokens: 2, cachedTokens: 3, reasoningTokens: 4, imageTokens: 5 });
    const total = t.getTotal();
    expect(total.cachedTokens).toBe(3);
    expect(total.reasoningTokens).toBe(4);
    expect(total.imageTokens).toBe(5);
  });

  it('should estimate cost from accumulated usage', () => {
    const t = new UsageTracker();
    t.addUsage({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    expect(t.estimateCost(0.01, 0.02)).toBeCloseTo(100 * 0.01 + 50 * 0.02, 10);
  });
});

describe('stream helpers', () => {
  it('streamToText should concatenate token content', async () => {
    const events: LlmStreamEvent[] = [
      { type: 'start', timestamp: 0 },
      { type: 'token', content: 'Hello ', timestamp: 1 },
      { type: 'token', content: 'World', timestamp: 2 },
      { type: 'finish', timestamp: 3 },
    ];
    expect(await streamToText(gen(events))).toBe('Hello World');
  });

  it('streamToText should throw on error event', async () => {
    const events: LlmStreamEvent[] = [
      { type: 'error', error: 'boom', timestamp: 0 },
    ];
    await expect(streamToText(gen(events))).rejects.toThrow('boom');
  });

  it('streamToArray should collect all events', async () => {
    const events: LlmStreamEvent[] = [
      { type: 'token', content: 'a', timestamp: 0 },
      { type: 'finish', timestamp: 1 },
    ];
    const arr = await streamToArray(gen(events));
    expect(arr.length).toBe(2);
    expect(arr[0].type).toBe('token');
  });

  it('streamToBuffer should join content bytes', async () => {
    const events: LlmStreamEvent[] = [
      { type: 'token', content: 'ab', timestamp: 0 },
      { type: 'token', content: 'cd', timestamp: 1 },
    ];
    const buf = await streamToBuffer(gen(events));
    expect(buf.toString('utf-8')).toBe('abcd');
  });
});
