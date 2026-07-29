// 插件共享的进程/运行时工具：日志接线、运行时环境垫片与全局 verbose 控制台辅助。
// openclaw 原始实现为 barrel 重导出，依赖 ../runtime.js、../globals.js、
// ../utils.js、../infra/*.js 等未移植模块。此处提供最小可用实现。

/** 运行时环境抽象，封装进程 IO 与退出行为。 */
export type RuntimeEnv = {
  /** 标准输出流。 */
  stdout: { write(text: string): boolean };
  /** 标准错误流。 */
  stderr: { write(text: string): boolean };
  /** 退出进程；nonExiting 实现不真正退出。 */
  exit(code?: number): void;
};

/** 创建不会真正退出进程的运行时环境，用于测试与插件沙箱。 */
export function createNonExitingRuntime(): RuntimeEnv {
  return {
    stdout: { write: () => true },
    stderr: { write: () => true },
    exit: (_code?: number) => {
      // 不真正退出进程
    },
  };
}

/** 默认运行时环境。 */
export const defaultRuntime: RuntimeEnv = createNonExitingRuntime();

// ---- 全局 verbose / yes 控制（与 openclaw globals.js 对齐） ----
let verbose = false;
let yes = false;

/** 是否处于 verbose 模式。 */
export function isVerbose(): boolean {
  return verbose;
}
/** 开启/关闭 verbose 模式。 */
export function setVerbose(value: boolean): void {
  verbose = value;
}
/** 是否处于 yes（自动确认）模式。 */
export function isYes(): boolean {
  return yes;
}
/** 开启/关闭 yes 模式。 */
export function setYes(value: boolean): void {
  yes = value;
}
/** 判断当前是否应输出 verbose 日志。 */
export function shouldLogVerbose(): boolean {
  return verbose;
}
/** 输出 verbose 日志到控制台。 */
export function logVerboseConsole(message: string): void {
  if (verbose) console.debug(message);
}
/** 输出 verbose 日志（与 logVerboseConsole 相同语义）。 */
export function logVerbose(message: string): void {
  logVerboseConsole(message);
}
/** 输出 info 级别消息。 */
export function info(message: string): void {
  console.info(message);
}
/** 输出 success 级别消息。 */
export function success(message: string): void {
  console.log(message);
}
/** 输出 warn 级别消息。 */
export function warn(message: string): void {
  console.warn(message);
}
/** 输出 danger 级别消息。 */
export function danger(message: string): void {
  console.error(message);
}

// ---- 通用工具 ----
/** 异步休眠指定毫秒数。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 为 Promise 添加超时保护，超时后拒绝。 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(message ?? `Operation timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** 判断环境变量值是否为真值（1/true/yes 等，不区分大小写）。 */
export function isTruthyEnvValue(value: string | undefined | null): boolean {
  if (value == null) return false;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

/** 等待 AbortSignal 触发。 */
export async function waitForAbortSignal(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/** 退避策略。 */
export type BackoffPolicy = {
  /** 初始退避时间（毫秒）。 */
  initialMs: number;
  /** 最大退避时间（毫秒）。 */
  maxMs: number;
  /** 退避乘数。 */
  multiplier: number;
};

/** 计算第 n 次重试的退避时间（毫秒）。 */
export function computeBackoff(attempt: number, policy: BackoffPolicy): number {
  const delay = policy.initialMs * Math.pow(policy.multiplier, attempt);
  return Math.min(delay, policy.maxMs);
}

/** 带中断信号的休眠。 */
export async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  await Promise.race([sleep(ms), waitForAbortSignal(signal)]);
}

/** 精确格式化时长（含小时/分/秒/毫秒）。 */
export function formatDurationPrecise(ms: number): string {
  if (ms < 0) ms = 0;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const millis = Math.floor(ms % 1000);
  return `${h}h${m}m${s}.${String(millis).padStart(3, "0")}s`;
}

/** 以秒为单位格式化时长。 */
export function formatDurationSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

/** 带退避重试的异步执行。 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  options?: { attempts?: number; backoff?: BackoffPolicy; signal?: AbortSignal },
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const backoff = options?.backoff ?? { initialMs: 100, maxMs: 5000, multiplier: 2 };
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await sleepWithAbort(computeBackoff(i, backoff), options?.signal ?? new AbortController().signal);
      }
    }
  }
  throw lastError;
}

// TODO: 依赖模块未移植，暂用本地桩
export function ensureGlobalUndiciEnvProxyDispatcher(): void {
  // 待 infra/net/undici-global-dispatcher.js 移植后接入
}

// TODO: 依赖模块未移植，暂用本地桩
export function registerUncaughtExceptionHandler(_handler: (error: Error) => void): () => void {
  const listener = (error: unknown) => _handler(error instanceof Error ? error : new Error(String(error)));
  process.on("uncaughtException", listener as NodeJS.UncaughtExceptionListener);
  return () => process.off("uncaughtException", listener as NodeJS.UncaughtExceptionListener);
}

// TODO: 依赖模块未移植，暂用本地桩
export function registerUnhandledRejectionHandler(
  _handler: (reason: unknown) => void,
): () => void {
  const listener = (reason: unknown) => _handler(reason);
  process.on("unhandledRejection", listener);
  return () => process.off("unhandledRejection", listener);
}

// TODO: 依赖模块未移植，暂用本地桩
export function isWSL2Sync(): boolean {
  return false;
}
