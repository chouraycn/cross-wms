// 安装 fatal 和瞬态 unhandled rejection/exception 处理器。
// 降级实现：从 openclaw/src/infra/unhandled-rejections.ts 移植，
// - normalizeLowercaseStringOrEmpty 使用本地 string-coerce.js 替代 @openclaw/normalization-core/string-coerce
// - restoreTerminalState 降级为 no-op（openclaw 的 ../../packages/terminal-core/src/restore.js 未移植）
// - collectErrorGraphCandidates 和 formatUncaughtError 本地实现（cross-wms 的 errors.ts 未导出）
import process from "node:process";
import { normalizeLowercaseStringOrEmpty } from "./string-coerce.js";
import {
  extractErrorCode,
  formatErrorMessage,
  readErrorName,
} from "./errors.js";
import { runFatalErrorHooks } from "./fatal-error-hooks.js";

/**
 * restoreTerminalState 降级 stub。
 * openclaw 的 ../../packages/terminal-core/src/restore.js 导出此函数用于在崩溃前恢复终端状态，
 * cross-wms 未移植 terminal-core，这里降级为 no-op。
 */
function restoreTerminalState(_reason: string, _options?: { resumeStdinIfPaused?: boolean }): void {
  // no-op
}

type UnhandledRejectionHandler = (reason: unknown) => boolean;
type UncaughtExceptionHandler = (error: unknown) => boolean;

// 插件通过自己的分阶段 node_modules 解析 `openclaw/plugin-sdk/runtime`，
// 这会加载此模块的单独副本。为了保持注册表状态跨实例共享，
// 将 handlers Set 锚定在 globalThis 上。
const HANDLERS_GLOBAL_KEY = Symbol.for("openclaw.unhandledRejection.handlers");
const EXCEPTION_HANDLERS_GLOBAL_KEY = Symbol.for("openclaw.uncaughtException.handlers");
const handlers: Set<UnhandledRejectionHandler> = (() => {
  const g = globalThis as unknown as Record<symbol, Set<UnhandledRejectionHandler>>;
  const existing = g[HANDLERS_GLOBAL_KEY];
  if (existing instanceof Set) {
    return existing;
  }
  const created = new Set<UnhandledRejectionHandler>();
  g[HANDLERS_GLOBAL_KEY] = created;
  return created;
})();
const exceptionHandlers: Set<UncaughtExceptionHandler> = (() => {
  const g = globalThis as unknown as Record<symbol, Set<UncaughtExceptionHandler>>;
  const existing = g[EXCEPTION_HANDLERS_GLOBAL_KEY];
  if (existing instanceof Set) {
    return existing;
  }
  const created = new Set<UncaughtExceptionHandler>();
  g[EXCEPTION_HANDLERS_GLOBAL_KEY] = created;
  return created;
})();

const FATAL_ERROR_CODES = new Set([
  "ERR_OUT_OF_MEMORY",
  "ERR_SCRIPT_EXECUTION_TIMEOUT",
  "ERR_WORKER_OUT_OF_MEMORY",
  "ERR_WORKER_UNCAUGHT_EXCEPTION",
  "ERR_WORKER_INITIALIZATION_FAILED",
]);

const CONFIG_ERROR_CODES = new Set(["INVALID_CONFIG", "MISSING_API_KEY", "MISSING_CREDENTIALS"]);

// 指示瞬时故障（不应使 gateway 崩溃）的网络错误代码
const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ECONNABORTED",
  "EPIPE",
  "ENETDOWN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EADDRNOTAVAIL",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_DNS_RESOLVE_FAILED",
  "UND_ERR_CONNECT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ERR_HTTP2_INVALID_SESSION",
  "EPROTO",
  "ERR_SSL_WRONG_VERSION_NUMBER",
  "ERR_SSL_PROTOCOL_RETURNED_AN_ERROR",
]);

const TRANSIENT_NETWORK_ERROR_NAMES = new Set([
  "AbortError",
  "ConnectTimeoutError",
  "HeadersTimeoutError",
  "BodyTimeoutError",
  "TimeoutError",
]);

const TRANSIENT_SQLITE_CODES = new Set([
  "SQLITE_BUSY",
  "SQLITE_CANTOPEN",
  "SQLITE_IOERR",
  "SQLITE_LOCKED",
]);

const TRANSIENT_SQLITE_ERRCODES = new Set([5, 6, 10, 14]);

const BENIGN_UNCAUGHT_EXCEPTION_CODES = new Set(["EPIPE", "EIO"]);
const BENIGN_UNCAUGHT_EXCEPTION_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ENETDOWN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EADDRNOTAVAIL",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_DNS_RESOLVE_FAILED",
  "UND_ERR_CONNECT",
  "ERR_HTTP2_INVALID_SESSION",
]);

const TRANSIENT_NETWORK_MESSAGE_CODE_RE =
  /\b(ECONNRESET|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ESOCKETTIMEDOUT|ECONNABORTED|EPIPE|ENETDOWN|EHOSTUNREACH|ENETUNREACH|EADDRNOTAVAIL|EAI_AGAIN|EPROTO|UND_ERR_CONNECT_TIMEOUT|UND_ERR_DNS_RESOLVE_FAILED|UND_ERR_CONNECT|UND_ERR_SOCKET|UND_ERR_HEADERS_TIMEOUT|UND_ERR_BODY_TIMEOUT|ERR_HTTP2_INVALID_SESSION)\b/i;
const BENIGN_UNCAUGHT_EXCEPTION_NETWORK_MESSAGE_CODE_RE =
  /\b(ECONNREFUSED|ENETDOWN|EHOSTUNREACH|ENETUNREACH|EADDRNOTAVAIL|EAI_AGAIN|ENOTFOUND|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_DNS_RESOLVE_FAILED|UND_ERR_CONNECT|ERR_HTTP2_INVALID_SESSION)\b/i;
const WS_PRE_HANDSHAKE_CLOSE_MESSAGE = "websocket was closed before the connection was established";

const TRANSIENT_SQLITE_MESSAGE_CODE_RE =
  /\b(SQLITE_BUSY|SQLITE_CANTOPEN|SQLITE_IOERR|SQLITE_LOCKED)\b/i;

const TRANSIENT_NETWORK_MESSAGE_SNIPPETS = [
  "getaddrinfo",
  "socket hang up",
  "client network socket disconnected before secure tls connection was established",
  "network error",
  "network is unreachable",
  "temporary failure in name resolution",
  "upstream connect error",
  "disconnect/reset before headers",
  "tlsv1 alert",
  "ssl routines",
  "packet length too long",
  "write eproto",
];

const TRANSIENT_SQLITE_MESSAGE_SNIPPETS = [
  "unable to open database file",
  "database is locked",
  "database table is locked",
  "disk i/o error",
];

/**
 * 收集错误图中所有候选错误对象（降级实现）。
 * openclaw 的 errors.ts 导出 collectErrorGraphCandidates，cross-wms 未导出，这里本地实现。
 */
function collectErrorGraphCandidates(
  err: unknown,
  resolveNested?: (current: Record<string, unknown>) => Iterable<unknown>,
): unknown[] {
  const queue: unknown[] = [err];
  const seen = new Set<unknown>();
  const candidates: unknown[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null || seen.has(current)) {
      continue;
    }
    seen.add(current);
    candidates.push(current);

    if (!current || typeof current !== "object" || !resolveNested) {
      continue;
    }
    for (const nested of resolveNested(current as Record<string, unknown>)) {
      if (nested != null && !seen.has(nested)) {
        queue.push(nested);
      }
    }
  }
  return candidates;
}

/**
 * 格式化未捕获错误（降级实现）。
 * openclaw 的 errors.ts 导出 formatUncaughtError，cross-wms 未导出，这里本地实现。
 */
function formatUncaughtError(err: unknown): string {
  if (extractErrorCode(err) === "INVALID_CONFIG") {
    return formatErrorMessage(err);
  }
  if (err instanceof Error) {
    const stack = err.stack ?? err.message ?? err.name;
    return stack;
  }
  return formatErrorMessage(err);
}

function hasSqliteSignal(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }

  const code = extractErrorCode(err);
  if (typeof code === "string") {
    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode === "ERR_SQLITE_ERROR" || normalizedCode.startsWith("SQLITE_")) {
      return true;
    }
  }

  const name = normalizeLowercaseStringOrEmpty(readErrorName(err));
  if (name.includes("sqlite")) {
    return true;
  }

  const message =
    "message" in err && typeof err.message === "string"
      ? normalizeLowercaseStringOrEmpty(err.message)
      : "";
  if (message.includes("sqlite")) {
    return true;
  }

  return false;
}

function isWrappedFetchFailedMessage(message: string): boolean {
  if (message === "fetch failed") {
    return true;
  }

  // 保留包装变体（例如 "...: fetch failed"），同时避免广泛匹配
  // 如 "Web fetch failed (404): ..." 这些不是传输失败的错误。
  return /:\s*fetch failed$/.test(message);
}

function isBenignUncaughtNetworkMessage(message: string): boolean {
  if (BENIGN_UNCAUGHT_EXCEPTION_NETWORK_MESSAGE_CODE_RE.test(message)) {
    return true;
  }

  // `ws` 在 close()/terminate() 中止 CONNECTING socket 时发出此确切 Error。
  // 保持精确匹配以便任意 WebSocket 错误仍走 fatal 路径。
  return message === WS_PRE_HANDSHAKE_CLOSE_MESSAGE;
}

function getErrorCause(err: unknown): unknown {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  return (err as { cause?: unknown }).cause;
}

function extractErrorCodeOrErrno(err: unknown): string | undefined {
  const code = extractErrorCode(err);
  if (typeof code === "string" && code) {
    return code.trim().toUpperCase();
  }
  if (typeof code === "number" && Number.isFinite(code)) {
    return String(code);
  }
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const errno = (err as { errno?: unknown }).errno;
  if (typeof errno === "string" && errno.trim()) {
    return errno.trim().toUpperCase();
  }
  if (typeof errno === "number" && Number.isFinite(errno)) {
    return String(errno);
  }
  return undefined;
}

function extractNumericErrorCode(err: unknown, key: "errno" | "errcode"): number | undefined {
  if (!err || typeof err !== "object") {
    return undefined;
  }
  const value = (err as Record<"errno" | "errcode", unknown>)[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function extractErrorCodeWithCause(err: unknown): string | undefined {
  const direct = extractErrorCode(err);
  if (typeof direct === "string") {
    return direct;
  }
  if (typeof direct === "number") {
    return String(direct);
  }
  const causeCode = extractErrorCode(getErrorCause(err));
  if (typeof causeCode === "string") {
    return causeCode;
  }
  if (typeof causeCode === "number") {
    return String(causeCode);
  }
  return undefined;
}

/**
 * 检查错误是否为 AbortError。
 * 这些通常是意图取消（例如在关闭期间），不应导致崩溃。
 */
export function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") {
    return false;
  }
  const name = "name" in err ? String(err.name) : "";
  if (name === "AbortError") {
    return true;
  }
  // 检查来自 Node 的 undici 的 "This operation was aborted" 消息
  const message = "message" in err && typeof err.message === "string" ? err.message : "";
  if (message === "This operation was aborted") {
    return true;
  }
  return false;
}

function isFatalError(err: unknown): boolean {
  const code = extractErrorCodeWithCause(err);
  return code !== undefined && FATAL_ERROR_CODES.has(code);
}

function isConfigError(err: unknown): boolean {
  const code = extractErrorCodeWithCause(err);
  return code !== undefined && CONFIG_ERROR_CODES.has(code);
}

function collectNestedUnhandledErrorCandidates(err: unknown): unknown[] {
  return collectErrorGraphCandidates(err, (current) => {
    const nested: Array<unknown> = [
      current.cause,
      current.reason,
      current.original,
      current.error,
      current.data,
    ];
    if (Array.isArray(current.errors)) {
      nested.push(...current.errors);
    }
    return nested;
  });
}

/**
 * 检查错误是否为不应使 gateway 崩溃的瞬时网络错误。
 * 这些通常是会自行解决的临时连接问题。
 */
export function isTransientNetworkError(err: unknown): boolean {
  if (!err) {
    return false;
  }
  for (const candidate of collectNestedUnhandledErrorCandidates(err)) {
    const code = extractErrorCodeOrErrno(candidate);
    if (code && TRANSIENT_NETWORK_CODES.has(code)) {
      return true;
    }

    const name = readErrorName(candidate);
    if (name && TRANSIENT_NETWORK_ERROR_NAMES.has(name)) {
      return true;
    }

    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const rawMessage = (candidate as { message?: unknown }).message;
    const message = normalizeLowercaseStringOrEmpty(rawMessage);
    if (!message) {
      continue;
    }
    if (TRANSIENT_NETWORK_MESSAGE_CODE_RE.test(message)) {
      return true;
    }
    if (isWrappedFetchFailedMessage(message)) {
      return true;
    }
    if (TRANSIENT_NETWORK_MESSAGE_SNIPPETS.some((snippet) => message.includes(snippet))) {
      return true;
    }
  }

  return false;
}

export function isTransientSqliteError(err: unknown): boolean {
  if (!err) {
    return false;
  }

  for (const candidate of collectNestedUnhandledErrorCandidates(err)) {
    const code = extractErrorCodeOrErrno(candidate);
    if (code && TRANSIENT_SQLITE_CODES.has(code)) {
      return true;
    }

    if (!hasSqliteSignal(candidate)) {
      continue;
    }

    const sqliteErrcode = extractNumericErrorCode(candidate, "errcode");
    if (sqliteErrcode !== undefined && TRANSIENT_SQLITE_ERRCODES.has(sqliteErrcode)) {
      return true;
    }

    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const messageParts = [
      (candidate as { message?: unknown }).message,
      (candidate as { errstr?: unknown }).errstr,
    ];
    for (const rawMessage of messageParts) {
      const message = normalizeLowercaseStringOrEmpty(rawMessage);
      if (!message) {
        continue;
      }
      if (TRANSIENT_SQLITE_MESSAGE_CODE_RE.test(message)) {
        return true;
      }
      if (TRANSIENT_SQLITE_MESSAGE_SNIPPETS.some((snippet) => message.includes(snippet))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 检查错误是否为不应使 gateway 崩溃的瞬时文件监视器错误。
 * 这些通常是资源耗尽问题（例如 inotify watches 耗尽），
 * 可以通过降级为手动同步模式来恢复。
 *
 * 注意：ENOSPC 是通用 POSIX 错误代码（磁盘满、写入失败等）。
 * 为避免错误分类无关的存储失败，我们要求同时有 ENOSPC 代码
 * 和 watch/inotify 相关消息指示器，类似于 hasSqliteSignal 门控 SQLite 错误。
 */
export function isTransientFileWatchError(err: unknown): boolean {
  if (!err) {
    return false;
  }

  const hasFileWatchSignal = (message: string) =>
    message.includes("inotify") ||
    message.includes("watcher") ||
    message.includes("file watcher") ||
    message.includes("watch limit") ||
    message.includes("max watches");
  const hasFileWatchExhaustionSignal = (message: string) =>
    message.includes("inotify watches") ||
    message.includes("inotify watch") ||
    message.includes("system limit for number of file watchers") ||
    message.includes("watch limit") ||
    message.includes("max watches");

  for (const candidate of collectNestedUnhandledErrorCandidates(err)) {
    // 尽早跳过非对象候选
    if (!candidate || typeof candidate !== "object") {
      continue;
    }

    const code = extractErrorCodeOrErrno(candidate);
    const rawMessage =
      "message" in candidate && typeof candidate.message === "string" ? candidate.message : "";
    const message = normalizeLowercaseStringOrEmpty(rawMessage);

    // ENOSPC 要求同时有代码和 watch/inotify 消息指示器
    // 以避免将通用磁盘满错误错误分类为瞬时监视器错误。
    if (code === "ENOSPC") {
      if (hasFileWatchSignal(message)) {
        return true;
      }
      // 没有 watch 指示器的 ENOSPC 不在此分类
      continue;
    }

    // 没有 ENOSPC 代码时，仅分类显式监视器资源耗尽。
    // 通用 "file watcher failed" 标签可能包装权限/配置/运行时失败。
    if (!message) {
      continue;
    }
    if (
      (message.includes("no space left on device") && hasFileWatchSignal(message)) ||
      hasFileWatchExhaustionSignal(message)
    ) {
      return true;
    }
  }

  return false;
}

export function isTransientUnhandledRejectionError(err: unknown): boolean {
  return (
    isTransientNetworkError(err) || isTransientSqliteError(err) || isTransientFileWatchError(err)
  );
}

function isBenignUncaughtNetworkException(err: unknown): boolean {
  for (const candidate of collectNestedUnhandledErrorCandidates(err)) {
    const code = extractErrorCodeOrErrno(candidate);
    if (code && BENIGN_UNCAUGHT_EXCEPTION_NETWORK_CODES.has(code)) {
      return true;
    }
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const message = normalizeLowercaseStringOrEmpty((candidate as { message?: unknown }).message);
    if (message && isBenignUncaughtNetworkMessage(message)) {
      return true;
    }
  }
  return false;
}

export function isBenignUncaughtExceptionError(err: unknown): boolean {
  if (isBenignUncaughtNetworkException(err)) {
    return true;
  }
  for (const candidate of collectNestedUnhandledErrorCandidates(err)) {
    const code = extractErrorCodeOrErrno(candidate);
    if (code && BENIGN_UNCAUGHT_EXCEPTION_CODES.has(code)) {
      return true;
    }
  }
  return false;
}

export function registerUnhandledRejectionHandler(handler: UnhandledRejectionHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function isUnhandledRejectionHandled(reason: unknown): boolean {
  for (const handler of handlers) {
    try {
      if (handler(reason)) {
        return true;
      }
    } catch (err) {
      console.error(
        "[openclaw] Unhandled rejection handler failed:",
        err instanceof Error ? (err.stack ?? err.message) : err,
      );
    }
  }
  return false;
}

export function registerUncaughtExceptionHandler(handler: UncaughtExceptionHandler): () => void {
  exceptionHandlers.add(handler);
  return () => {
    exceptionHandlers.delete(handler);
  };
}

export function isUncaughtExceptionHandled(error: unknown): boolean {
  for (const handler of exceptionHandlers) {
    try {
      if (handler(error)) {
        return true;
      }
    } catch (err) {
      console.error(
        "[openclaw] Uncaught exception handler failed:",
        err instanceof Error ? (err.stack ?? err.message) : err,
      );
    }
  }
  return false;
}

export function installUnhandledRejectionHandler(): void {
  const exitWithTerminalRestore = (reason: string, error?: unknown, hookReason = reason) => {
    for (const message of runFatalErrorHooks({ reason: hookReason, error })) {
      console.error("[openclaw]", message);
    }
    restoreTerminalState(reason, { resumeStdinIfPaused: false });
    process.exit(1);
  };

  process.on("unhandledRejection", (reason, _promise) => {
    if (isUnhandledRejectionHandled(reason)) {
      return;
    }

    // AbortError 通常是意图取消（例如在关闭期间）
    // 记录但不崩溃 - 这些在优雅关闭期间是预期的
    if (isAbortError(reason)) {
      console.warn("[openclaw] Suppressed AbortError:", formatUncaughtError(reason));
      return;
    }

    if (isFatalError(reason)) {
      console.error("[openclaw] FATAL unhandled rejection:", formatUncaughtError(reason));
      exitWithTerminalRestore("fatal unhandled rejection", reason, "fatal_unhandled_rejection");
      return;
    }

    if (isConfigError(reason)) {
      console.error("[openclaw] CONFIGURATION ERROR - requires fix:", formatUncaughtError(reason));
      exitWithTerminalRestore("configuration error", reason, "configuration_error");
      return;
    }

    if (isTransientUnhandledRejectionError(reason)) {
      console.warn(
        "[openclaw] Non-fatal unhandled rejection (continuing):",
        formatUncaughtError(reason),
      );
      return;
    }

    console.error("[openclaw] Unhandled promise rejection:", formatUncaughtError(reason));
    exitWithTerminalRestore("unhandled rejection", reason, "unhandled_rejection");
  });
}
