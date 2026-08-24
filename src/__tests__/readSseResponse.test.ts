import { describe, it, expect, vi } from 'vitest';
import { readSseResponse, fetchSseStream, type SSEEvent } from '../utils/sse/readSseResponse';

/**
 * 将若干字符串 chunk 组装成带 ReadableStream body 的 Response。
 * 每个 chunk 独立 encode，模拟网络分片（可故意在 multibyte 字符中间切断）。
 */
function makeResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(encoder.encode(c));
      }
      controller.close();
    },
  });
  return new Response(stream, { status });
}

function collect(response: Response): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  return readSseResponse(response, (e) => events.push(e)).then(() => events);
}

describe('readSseResponse', () => {
  it('解析单个 data 事件并 JSON 反序列化', async () => {
    const events = await collect(makeResponse(['data: {"type":"text"}\n\n']));
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ type: 'text' });
  });

  it('按空行切分多个事件', async () => {
    const raw = 'data: {"n":1}\n\ndata: {"n":2}\n\n';
    const events = await collect(makeResponse([raw]));
    expect(events.map((e) => e.data)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('识别 event: 字段（含无空格形式 event:foo）', async () => {
    const events = await collect(makeResponse(['event: done\ndata: {"ok":true}\n\n']));
    expect(events[0].event).toBe('done');
    expect(events[0].data).toEqual({ ok: true });
  });

  it('多行 data: 用 \\n 连接', async () => {
    const events = await collect(makeResponse(['data: line1\ndata: line2\n\n']));
    expect(events[0].data).toBe('line1\nline2');
  });

  it('末尾无空行也能 flush 出最后一个事件', async () => {
    const events = await collect(makeResponse(['data: {"tail":true}\n']));
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ tail: true });
  });

  it('跨 chunk 的多字节 UTF-8 字符不被截半（铁律：尾部 flush）', async () => {
    // "中" = E4 B8 AD，故意在字节边界切断，模拟分片
    const full = 'data: {"msg":"中文测试"}\n\n';
    const bytes = new TextEncoder().encode(full);
    const cut = 10; // 落在某多字节字符中间
    const c1 = bytes.slice(0, cut);
    const c2 = bytes.slice(cut);
    const decoder = new TextDecoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(c1);
        controller.enqueue(c2);
        controller.close();
      },
    });
    const events: SSEEvent[] = [];
    await readSseResponse(new Response(stream), (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].data).toEqual({ msg: '中文测试' });
    // 确保没有替换字符（U+FFFD）
    expect(JSON.stringify(events[0].data)).not.toContain('�');
  });

  it('response 无 body 时抛出明确错误', async () => {
    const res = new Response(null, { status: 200 });
    await expect(readSseResponse(res, () => {})).rejects.toThrow('当前浏览器不支持流式响应');
  });
});

describe('fetchSseStream', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('2xx 时透传事件', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeResponse(['data: {"n":1}\n\ndata: {"n":2}\n\n'], 200),
    );
    const events: SSEEvent[] = [];
    await fetchSseStream(
      'https://example.test/stream',
      { method: 'POST' },
      (e) => events.push(e),
    );
    expect(events.map((e) => e.data)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('非 2xx 时调用 onError 并抛出', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('boom', { status: 500 }),
    );
    const onError = vi.fn((_s: number, _t: string) => {
      throw new Error('handled');
    });
    await expect(
      fetchSseStream('https://example.test/err', { method: 'POST' }, () => {}, onError),
    ).rejects.toThrow('handled');
    expect(onError).toHaveBeenCalledWith(500, expect.any(String));
  });
});
