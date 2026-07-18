// 轮询通道传输直到它们准备好接受运行时工作。
// 降级实现：从 openclaw/src/infra/transport-ready.ts 移植，
// - 使用本地 _runtime-stubs.ts 的 resolveTimerTimeoutMs 替代 @openclaw/normalization-core/number-coercion
// - 使用本地 runtime-guard.ts 的 RuntimeEnv 类型替代 ../runtime.js
// - danger 函数降级为返回原始字符串（openclaw 的 ../globals.js 中导出）
import { resolveTimerTimeoutMs } from "./_runtime-stubs.js";
import type { RuntimeEnv } from "./runtime-guard.js";
import { sleepWithAbort } from "./backoff.js";

/**
 * danger 函数降级 stub。
 * openclaw 的 ../globals.js 中导出 danger 用于在终端中渲染红色文本，
 * cross-wms 降级为返回原始字符串。
 */
function danger(text: string): string {
  return text;
}

/** 一次传输就绪探测尝试返回的结果。 */
export type TransportReadyResult = {
  ok: boolean;
  error?: string | null;
};

/** 轮询通道传输直到它可以接受运行时工作的参数。 */
export type WaitForTransportReadyParams = {
  label: string;
  timeoutMs: number;
  logAfterMs?: number;
  logIntervalMs?: number;
  pollIntervalMs?: number;
  abortSignal?: AbortSignal;
  runtime: RuntimeEnv;
  check: () => Promise<TransportReadyResult>;
};

/**
 * 轮询通道传输就绪探测直到成功、超时或中止。
 *
 * 用于在处理入站事件之前启动外部守护进程或订阅本地传输的通道插件，
 * 通过调用方的运行时 sink 进行有界重试日志记录。
 */
export async function waitForTransportReady(params: WaitForTransportReadyParams): Promise<void> {
  const started = Date.now();
  const timeoutMs = resolveTimerTimeoutMs(params.timeoutMs, 0, 0);
  const deadline = started + timeoutMs;
  const logAfterMs = resolveTimerTimeoutMs(params.logAfterMs, timeoutMs, 0);
  const logIntervalMs = resolveTimerTimeoutMs(params.logIntervalMs, 30_000, 1_000);
  const pollIntervalMs = resolveTimerTimeoutMs(params.pollIntervalMs, 150, 50);
  let nextLogAt = started + logAfterMs;
  let lastError: string | null = null;

  while (true) {
    if (params.abortSignal?.aborted) {
      return;
    }
    const res = await params.check();
    if (res.ok) {
      return;
    }
    lastError = res.error ?? null;

    const now = Date.now();
    if (now >= deadline) {
      break;
    }
    if (now >= nextLogAt) {
      const elapsedMs = now - started;
      params.runtime.error?.(
        danger(`${params.label} not ready after ${elapsedMs}ms (${lastError ?? "unknown error"})`),
      );
      nextLogAt = now + logIntervalMs;
    }

    try {
      // 中止是协作式的：sleepWithAbort 可能在中止时抛错，但调用方将中止视为
      // 安静停止而非传输失败。
      await sleepWithAbort(pollIntervalMs, params.abortSignal);
    } catch (err) {
      if (params.abortSignal?.aborted) {
        return;
      }
      throw err;
    }
  }

  params.runtime.error?.(
    danger(`${params.label} not ready after ${timeoutMs}ms (${lastError ?? "unknown error"})`),
  );
  throw new Error(`${params.label} not ready (${lastError ?? "unknown error"})`);
}
