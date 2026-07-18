/**
 * stream-adapter 测试 — SSE / NDJSON 解析与流事件合并。
 */
import { describe, it, expect } from 'vitest';
import {
  parseSSEChunk,
  parseSSEData,
  parseNDJSONChunk,
  parseBedrockEventStreamChunk,
  asyncIterableToStreamEvents,
  makeSSEParser,
  makeNDJSONParser,
  collectText,
} from '../stream-adapter.js';
import type { StreamEvent } from '../types.js';

describe('parseSSEChunk', () => {
  it('解析多帧 SSE 并返回 remainder', () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}\n\n';
    const { frames, remainder } = parseSSEChunk(buffer);
    expect(frames).toHaveLength(2);
    expect(frames[0].data).toBe('{"a":1}');
    expect(frames[1].data).toBe('{"b":2}');
    expect(remainder).toBe('');
  });

  it('未完成片段作为 remainder 返回', () => {
    const buffer = 'data: {"a":1}\n\ndata: {"b":2}';
    const { frames, remainder } = parseSSEChunk(buffer);
    expect(frames).toHaveLength(1);
    expect(remainder).toBe('data: {"b":2}');
  });

  it('保留 event 字段', () => {
    const buffer = 'event: ping\ndata: hello\n\n';
    const { frames } = parseSSEChunk(buffer);
    expect(frames[0].event).toBe('ping');
    expect(frames[0].data).toBe('hello');
  });

  it('跳过注释行', () => {
    const buffer = ': comment\ndata: hi\n\n';
    const { frames } = parseSSEChunk(buffer);
    expect(frames).toHaveLength(1);
    expect(frames[0].data).toBe('hi');
  });
});

describe('parseSSEData', () => {
  it('[DONE] 返回 null', () => {
    expect(parseSSEData('[DONE]')).toBeNull();
  });

  it('JSON 解析失败返回 undefined', () => {
    expect(parseSSEData('not json')).toBeUndefined();
  });

  it('有效 JSON 返回对象', () => {
    expect(parseSSEData('{"x":1}')).toEqual({ x: 1 });
  });
});

describe('parseNDJSONChunk', () => {
  it('按行解析 JSON', () => {
    const { items, remainder } = parseNDJSONChunk('{"a":1}\n{"b":2}\n');
    expect(items).toEqual([{ a: 1 }, { b: 2 }]);
    expect(remainder).toBe('');
  });

  it('未完成最后行作为 remainder', () => {
    const { items, remainder } = parseNDJSONChunk('{"a":1}\n{"b":2');
    expect(items).toEqual([{ a: 1 }]);
    expect(remainder).toBe('{"b":2');
  });

  it('跳过损坏行', () => {
    const { items } = parseNDJSONChunk('{"a":1}\nbroken\n{"b":2}\n');
    expect(items).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe('parseBedrockEventStreamChunk', () => {
  it('解码 base64 bytes 字段', () => {
    const payload = Buffer.from(JSON.stringify({ delta: { text: 'hi' } })).toString('base64');
    const { items } = parseBedrockEventStreamChunk(`{"bytes":"${payload}"}\n`);
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({ delta: { text: 'hi' } });
  });

  it('直接对象帧原样返回', () => {
    const { items } = parseBedrockEventStreamChunk('{"type":"x"}\n');
    expect(items[0]).toEqual({ type: 'x' });
  });
});

describe('makeSSEParser / makeNDJSONParser', () => {
  it('makeSSEParser 跨多次 chunk 维护 buffer', () => {
    const parser = makeSSEParser();
    const r1 = parser('data: {"a":');
    expect(r1.items).toEqual([]);
    const r2 = parser('1}\n\n');
    expect(r2.items).toEqual([{ a: 1 }]);
  });

  it('makeNDJSONParser 跨多次 chunk 维护 buffer', () => {
    const parser = makeNDJSONParser();
    const r1 = parser('{"a":1}\n{"b":');
    expect(r1.items).toEqual([{ a: 1 }]);
    const r2 = parser('2}\n');
    expect(r2.items).toEqual([{ b: 2 }]);
  });
});

describe('asyncIterableToStreamEvents', () => {
  it('将 chunk 流转换为 StreamEvent 流', async () => {
    const chunks = (async function* () {
      yield '{"a":1}\n';
      yield '{"a":2}\n';
    })();
    const events: StreamEvent[] = [];
    for await (const evt of asyncIterableToStreamEvents(
      chunks,
      (c) => parseNDJSONChunk(c),
      (item) => {
        const a = (item as { a: number }).a;
        return [{ type: 'text', content: String(a) }];
      },
    )) {
      events.push(evt);
    }
    expect(events).toEqual([
      { type: 'text', content: '1' },
      { type: 'text', content: '2' },
    ]);
  });
});

describe('collectText', () => {
  it('拼接所有文本事件', async () => {
    const events = (async function* () {
      yield { type: 'text', content: 'a' } as StreamEvent;
      yield { type: 'usage', usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } } as StreamEvent;
      yield { type: 'text', content: 'b' } as StreamEvent;
    })();
    const text = await collectText(events);
    expect(text).toBe('ab');
  });
});
