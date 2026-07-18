/**
 * Fetch 超时辅助 — 包装 fetch 调用添加超时与中止行为
 *
 * 参考 openclaw/src/utils/fetch-timeout.ts
 */
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveSafeTimeoutDelayMs } from "./timer-delay.js";

const log = createSubsystemLogger("fetch-timeout");
const LOG_URL_MAX_CHARS = 500;
const URL_SECRET_SUFFIX_PATTERN = /[?#]/;

type TimeoutAbortSignalParams = {
  timeoutMs?: number;
  signal?: AbortSignal;
  operation?: string;
  url?: string;
};

/**
 * 转发 abort 时不把 Event 参数作为 abort reason 转发。
 * 使用 .bind() 避免闭包作用域捕获（防内存泄漏）。
 */
function relayAbort(this: AbortController) {
  this.abort();
}

/** 返回绑定的 abort 转发器，用作事件监听 */
export function bindAbortRelay(controller: AbortController): () => void {
  return relayAbort.bind(controller);
}

function sanitizeTimeoutLogUrl(rawUrl: string | undefined): string | undefined {
  const trimmed = rawUrl?.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    // 在日志前剥离凭证、查询与片段；超时 URL 经常包含 provider token
    // 或签名请求参数。
    const parsed = new URL(trimmed);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    const value = parsed.toString();
    return value.length > LOG_URL_MAX_CHARS ? `${value.slice(0, LOG_URL_MAX_CHARS)}...` : value;
  } catch {
    const withoutQueryOrHash = trimmed.split(URL_SECRET_SUFFIX_PATTERN, 1)[0] ?? "";
    const cleaned = withoutQueryOrHash
      .replace(/[\r\n\u2028\u2029]+/g, " ")
      .replace(/\p{Cc}+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned) {
      return undefined;
    }
    return cleaned.length > LOG_URL_MAX_CHARS
      ? `${cleaned.slice(0, LOG_URL_MAX_CHARS)}...`
      : cleaned;
  }
}

function abortDueToTimeout(
  controller: AbortController,
  timeoutMs: number,
  startedAtMs: number,
  operation?: string,
  url?: string,
) {
  if (controller.signal.aborted) {
    return;
  }
  const sanitizedUrl = sanitizeTimeoutLogUrl(url);
  const elapsedMs = Math.max(0, Date.now() - startedAtMs);
  const delayMs = Math.max(0, elapsedMs - timeoutMs);
  // 较大的 elapsed/timeout 差距意味着定时器回调本身被饿死，
  // 这对运维者比另一条普通超时消息更有用。
  const eventLoopDelayHint =
    delayMs >= Math.max(1000, timeoutMs * 0.5)
      ? `timer delayed ${delayMs}ms, likely event-loop starvation`
      : null;
  const consoleMessage = [
    `fetch timeout after ${timeoutMs}ms`,
    `(elapsed ${elapsedMs}ms)`,
    eventLoopDelayHint,
    operation ? `operation=${operation}` : null,
    sanitizedUrl ? `url=${sanitizedUrl}` : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  log.warn("fetch timeout reached; aborting operation", {
    timeoutMs,
    elapsedMs,
    ...(eventLoopDelayHint ? { timerDelayMs: delayMs, eventLoopDelayHint } : {}),
    consoleMessage,
    ...(operation ? { operation } : {}),
    ...(sanitizedUrl ? { url: sanitizedUrl } : {}),
  });
  const error = new Error("request timed out");
  error.name = "TimeoutError";
  controller.abort(error);
}

/**
 * 构建组合父 signal 与超时的 abort signal。
 * 调用方必须执行 `cleanup`；`refresh` 仅重启内部超时定时器。
 */
export function buildTimeoutAbortSignal(params: TimeoutAbortSignalParams): {
  signal?: AbortSignal;
  cleanup: () => void;
  refresh: () => void;
} {
  const { timeoutMs, signal } = params;
  if (!timeoutMs && !signal) {
    return { signal: undefined, cleanup: () => {}, refresh: () => {} };
  }
  if (!timeoutMs) {
    return { signal, cleanup: () => {}, refresh: () => {} };
  }

  const controller = new AbortController();
  const normalizedTimeoutMs = resolveSafeTimeoutDelayMs(timeoutMs);
  let active = true;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const scheduleTimeout = () => {
    timeoutId = setTimeout(
      abortDueToTimeout,
      normalizedTimeoutMs,
      controller,
      normalizedTimeoutMs,
      Date.now(),
      params.operation,
      params.url,
    );
  };
  scheduleTimeout();
  const onAbort = bindAbortRelay(controller);
  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    refresh: () => {
      if (!active || controller.signal.aborted) {
        return;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      scheduleTimeout();
    },
    cleanup: () => {
      active = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    },
  };
}

/**
 * Fetch 包装：通过 AbortController 添加超时支持。
 *
 * @param url - 要 fetch 的 URL
 * @param init - RequestInit 选项（headers、method、body 等）
 * @param timeoutMs - 超时毫秒
 * @param fetchFn - 使用的 fetch 实现（默认为全局 fetch）
 * @returns fetch Response
 * @throws AbortError 请求超时时抛出
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchFn: typeof fetch = fetch,
): Promise<Response> {
  const { signal, cleanup } = buildTimeoutAbortSignal({
    timeoutMs: Math.max(1, timeoutMs),
    operation: "fetchWithTimeout",
    url,
  });
  try {
    return await fetchFn(url, { ...init, signal });
  } finally {
    cleanup();
  }
}
