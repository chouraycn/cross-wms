/**
 * JSONL Socket — 通过 Unix domain socket 发送一次性 JSONL 请求
 *
 * 发送一行 JSONL 请求，半关闭写入端，等待已接受的响应行。
 *
 * 参考 openclaw/src/infra/jsonl-socket.ts
 */
import net from "node:net";
import { clearTimeout as clearNodeTimeout, setTimeout as setNodeTimeout } from "node:timers";
import { resolveFiniteTimeoutDelayMs } from "./timer-delay.js";

/** 解析 JSONL socket 超时毫秒数，钳制到安全范围 */
function resolveJsonlSocketTimeoutMs(timeoutMs: number): number {
  // 最小 1ms，无效输入 fallback 到 1ms
  return resolveFiniteTimeoutDelayMs(
    Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 1,
    1,
  );
}

/** 通过 Unix socket 发送一行 JSONL 请求并等待 accept 返回的响应行 */
export async function requestJsonlSocket<T>(params: {
  socketPath: string;
  requestLine: string;
  timeoutMs: number;
  accept: (msg: unknown) => T | null | undefined;
}): Promise<T | null> {
  const { socketPath, requestLine, accept } = params;
  const timeoutMs = resolveJsonlSocketTimeoutMs(params.timeoutMs);
  return await new Promise((resolve) => {
    const client = new net.Socket();
    let settled = false;
    let buffer = "";

    const finish = (value: T | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearNodeTimeout(timer);
      try {
        client.destroy();
      } catch {
        // 忽略销毁错误
      }
      resolve(value);
    };

    const timer = setNodeTimeout(() => finish(null), timeoutMs);

    client.on("error", () => finish(null));
    client.on("end", () => finish(null));
    client.on("close", () => finish(null));
    client.connect(socketPath, () => {
      client.end(`${requestLine}\n`);
    });
    client.on("data", (data) => {
      buffer += data.toString("utf8");
      let idx = buffer.indexOf("\n");
      while (idx !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf("\n");
        if (!line) {
          continue;
        }
        try {
          const msg = JSON.parse(line) as unknown;
          const result = accept(msg);
          if (result === undefined) {
            continue;
          }
          finish(result);
          return;
        } catch {
          // 忽略 JSON 解析错误
        }
      }
    });
  });
}

export const testApi = { resolveJsonlSocketTimeoutMs };
export { testApi as __test__ };
