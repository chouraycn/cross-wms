/**
 * 流式适配器 — SSE / WebSocket / 自定义流格式统一为 AsyncGenerator<StreamEvent>。
 *
 * 不同 Provider 与传输方式有不同的流式协议：
 * - OpenAI / Anthropic / Google 等：HTTP + SSE（`data: {...}\n\n`）
 * - Bedrock：eventStream 二进制编码（base64 payload）
 * - Ollama：NDJSON（每行一个 JSON）
 * - WebSocket：消息帧
 *
 * 此模块提供：
 * - `parseSSEChunk`：将 SSE 字符串切分为 data 行
 * - `parseNDJSONChunk`：将 NDJSON 字符串切分为 JSON 对象
 * - `asyncIterableToStreamEvents`：通用 chunk → StreamEvent 转换
 * - `mergeStreamEvents`：合并多个流
 */
import type { StreamEvent } from './types.js';

/** SSE 数据帧。 */
export type SSEFrame = { event?: string; data: string; id?: string };

/** 将 SSE 文本缓冲切片为帧。返回 { frames, remainder }，remainder 是未完成的片段。 */
export function parseSSEChunk(buffer: string): { frames: SSEFrame[]; remainder: string } {
  const frames: SSEFrame[] = [];
  // 按双换行分割事件
  const events = buffer.split(/\r?\n\r?\n/);
  const remainder = events.pop() ?? '';
  for (const evt of events) {
    if (!evt.trim()) continue;
    let event: string | undefined;
    let data: string[] = [];
    let id: string | undefined;
    for (const line of evt.split(/\r?\n/)) {
      if (line.startsWith(':')) continue; // 注释
      if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        data.push(line.slice(5).trimStart());
      } else if (line.startsWith('id:')) {
        id = line.slice(3).trim();
      }
    }
    if (data.length > 0) {
      frames.push({ event, data: data.join('\n'), id });
    }
  }
  return { frames, remainder };
}

/** 解析 SSE data 字段为 JSON，处理 `[DONE]` 标记。 */
export function parseSSEData(data: string): unknown | undefined {
  if (data === '[DONE]') return null;
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

/** 将 NDJSON 字符串切分为 JSON 对象，未完成的最后一行作为 remainder。 */
export function parseNDJSONChunk(buffer: string): { items: unknown[]; remainder: string } {
  const items: unknown[] = [];
  const lines = buffer.split(/\r?\n/);
  const remainder = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      items.push(JSON.parse(line));
    } catch {
      // 跳过损坏行
    }
  }
  return { items, remainder };
}

/** Bedrock eventStream：每帧是 { bytes: base64 } 或 { payload: ... }。 */
export function parseBedrockEventStreamChunk(buffer: string): { items: unknown[]; remainder: string } {
  const items: unknown[] = [];
  const lines = buffer.split(/\r?\n/);
  const remainder = lines.pop() ?? '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      if (obj && typeof obj === 'object' && 'bytes' in obj) {
        const decoded = Buffer.from(obj.bytes as string, 'base64').toString('utf-8');
        try {
          items.push(JSON.parse(decoded));
        } catch {
          // 跳过
        }
      } else if (obj && typeof obj === 'object') {
        items.push(obj);
      }
    } catch {
      // 跳过
    }
  }
  return { items, remainder };
}

/** 将原始 chunk 流转换为 StreamEvent 流。 */
export async function* asyncIterableToStreamEvents(
  chunks: AsyncIterable<Uint8Array | string>,
  parser: (chunk: string) => { items: unknown[]; remainder: string },
  eventParser: (item: unknown) => StreamEvent[],
): AsyncGenerator<StreamEvent> {
  let buffer = '';
  for await (const raw of chunks) {
    const chunk = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
    buffer += chunk;
    const { items, remainder } = parser(buffer);
    buffer = remainder;
    for (const item of items) {
      for (const evt of eventParser(item)) {
        yield evt;
      }
    }
  }
  // 处理末尾剩余
  if (buffer.trim()) {
    const { items } = parser(buffer + '\n');
    for (const item of items) {
      for (const evt of eventParser(item)) {
        yield evt;
      }
    }
  }
}

/** 创建一个 SSE 解析器（与 asyncIterableToStreamEvents 配合）。 */
export function makeSSEParser(): (chunk: string) => { items: unknown[]; remainder: string } {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    const { frames, remainder } = parseSSEChunk(buffer);
    buffer = remainder;
    const items = frames
      .map((f) => parseSSEData(f.data))
      .filter((d): d is unknown => d !== undefined);
    return { items, remainder: buffer };
  };
}

/** 创建一个 NDJSON 解析器。 */
export function makeNDJSONParser(): (chunk: string) => { items: unknown[]; remainder: string } {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    const result = parseNDJSONChunk(buffer);
    buffer = result.remainder;
    return { items: result.items, remainder: buffer };
  };
}

/** 合并多个流事件源为单一流（按到达顺序）。 */
export async function* mergeStreamEvents(
  streams: Array<AsyncIterable<StreamEvent>>,
): AsyncGenerator<StreamEvent> {
  const queues: StreamEvent[][] = streams.map(() => []);
  const dones: boolean[] = streams.map(() => false);
  const readers = streams.map((s, i) => (async () => {
    for await (const evt of s) {
      queues[i].push(evt);
    }
    dones[i] = true;
  })());

  // 不等待所有完成，而是轮询
  let pending = readers.slice();
  while (pending.length > 0 || queues.some((q) => q.length > 0)) {
    let yielded = false;
    for (let i = 0; i < queues.length; i++) {
      if (queues[i].length > 0) {
        yield queues[i].shift()!;
        yielded = true;
      }
    }
    if (!yielded) {
      // 等待任意 reader 推进
      await Promise.race(pending.map((p) => p.then(() => new Promise((r) => setTimeout(r, 0))))).catch(() => {});
      pending = pending.filter((_, i) => !dones[i]);
      if (pending.length === 0 && queues.every((q) => q.length === 0)) break;
    }
  }
}

/** 收集流中所有文本片段并拼接。 */
export async function collectText(events: AsyncIterable<StreamEvent>): Promise<string> {
  let text = '';
  for await (const evt of events) {
    if (evt.type === 'text') text += evt.content;
  }
  return text;
}

/** 收集流中的 usage 事件。 */
export async function collectUsage(events: AsyncIterable<StreamEvent>): Promise<StreamEvent | undefined> {
  let lastUsage: StreamEvent | undefined;
  for await (const evt of events) {
    if (evt.type === 'usage' || evt.type === 'done') {
      lastUsage = evt;
    }
  }
  return lastUsage;
}
