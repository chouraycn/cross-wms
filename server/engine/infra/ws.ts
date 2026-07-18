// 将 WebSocket 原始负载数据规范化为字符串。
import { Buffer } from "node:buffer";
import type WebSocket from "ws";

// WebSocket.RawData 根据 ws 内部和调用者选项可能以字符串、buffer、ArrayBuffer
// 或 buffer 片段形式到达。
export function rawDataToString(
  data: WebSocket.RawData,
  encoding: BufferEncoding = "utf8",
): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString(encoding);
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString(encoding);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString(encoding);
  }
  return Buffer.from(String(data)).toString(encoding);
}
