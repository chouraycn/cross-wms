/**
 * SSE 响应读取原语 — 前端唯一的流式读取入口
 *
 * 背景（2026-08-04 去重）：
 * 收敛前前端有 5 个文件、7 处各自 `response.body.getReader()` 手写 SSE 循环，
 * 其中 `components/staff/api/client.ts` 的 streamPost/streamGet 与
 * `pages/staff/EmployeeChatPage.tsx` 的 readStaffStream 是逐字级重复，
 * 且各自复制了一份 parseSseBlock。重复带来的真实缺陷：
 *
 * 1. EmployeeChatPage 版本流结束时没有调用 `decoder.decode()` 做尾部 flush，
 *    多字节 UTF-8 字符跨 chunk 且落在流末尾时会丢字符。
 * 2. 手写的 `buffer.split('\n\n')` 无法处理 `\r\n\r\n` 分隔（部分代理会改写换行）。
 * 3. 「error 事件必须能被收到，否则前端卡在思考中」这类铁律，在 N 份实现里
 *    无法同时保证 —— 修好一处，另外几处依旧漏。
 *
 * 本模块把「读流 → 解码 → 分帧 → JSON 解析 → 尾部冲刷」收敛成一个函数，
 * 各调用方只保留自己的 URL / 鉴权 / 事件语义。
 */

import { SSEStreamParser, type SSEEvent } from './SSEStreamParser';

export type { SSEEvent };

/**
 * 读取一个 SSE 响应体，逐事件回调
 *
 * @param response fetch 返回的响应（调用方需自行检查 response.ok）
 * @param onEvent 每解析出一个完整事件触发一次
 * @throws 响应无 body 时抛出（浏览器不支持流式响应）
 */
export async function readSseResponse(
  response: Response,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
  if (!response.body) {
    throw new Error('当前浏览器不支持流式响应');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const parser = new SSEStreamParser();

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // stream: true —— 保留跨 chunk 的多字节字符前缀，避免中文被截半
      for (const event of parser.feed(decoder.decode(value, { stream: true }))) {
        onEvent(event);
      }
    }
    // 关键：decoder 与 parser 都要冲刷，否则末尾事件/字符可能丢失
    const tailChunk = decoder.decode();
    if (tailChunk) {
      for (const event of parser.feed(tailChunk)) onEvent(event);
    }
    for (const event of parser.flush()) onEvent(event);
  } finally {
    // 提前 return / 抛错时释放底层连接，避免 socket 泄漏
    reader.releaseLock();
  }
}

/**
 * 发起请求并读取 SSE 流的便捷封装
 *
 * @param onError 可选。响应非 2xx 时调用；未提供则抛出 Error（含响应体文本）
 */
export async function fetchSseStream(
  input: RequestInfo | URL,
  init: RequestInit,
  onEvent: (event: SSEEvent) => void,
  onError?: (status: number, text: string) => never,
): Promise<void> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (onError) onError(response.status, text);
    throw new Error(text || `HTTP ${response.status}`);
  }
  await readSseResponse(response, onEvent);
}
