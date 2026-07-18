/**
 * 长时运行频道传输的可武装空闲看门狗
 *
 * 参考 openclaw/src/channels/transport/stall-watchdog.ts
 */
import { resolveTimerTimeoutMs } from "../../shared/number-coercion.js";

/** 运行时环境的最小子集 — 仅需要 log 与 error 用于看门狗报告 */
export type StallWatchdogRuntimeEnv = {
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
};

/** 看门狗超时元数据 */
export type StallWatchdogTimeoutMeta = {
  idleMs: number;
  timeoutMs: number;
};

/** 传输 stall 看门狗实例的公共控制面 */
export type ArmableStallWatchdog = {
  arm: (atMs?: number) => void;
  touch: (atMs?: number) => void;
  disarm: () => void;
  stop: () => void;
  isArmed: () => boolean;
};

/** 创建一个看门狗，当武装的传输空闲时报告一次 */
export function createArmableStallWatchdog(params: {
  label: string;
  timeoutMs: number;
  checkIntervalMs?: number;
  abortSignal?: AbortSignal;
  runtime?: StallWatchdogRuntimeEnv;
  onTimeout: (meta: StallWatchdogTimeoutMeta) => void;
}): ArmableStallWatchdog {
  const timeoutMs = resolveTimerTimeoutMs(params.timeoutMs, 1);
  const defaultCheckIntervalMs = Math.min(5_000, Math.max(250, timeoutMs / 6));
  const checkIntervalMs = resolveTimerTimeoutMs(
    params.checkIntervalMs,
    defaultCheckIntervalMs,
    100,
  );

  let armed = false;
  let stopped = false;
  let lastActivityAt = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;

  const clearTimer = () => {
    if (!timer) {
      return;
    }
    clearInterval(timer);
    timer = null;
  };

  const disarm = () => {
    armed = false;
  };

  const stop = () => {
    if (stopped) {
      return;
    }
    stopped = true;
    disarm();
    clearTimer();
    params.abortSignal?.removeEventListener("abort", stop);
  };

  const arm = (atMs?: number) => {
    if (stopped) {
      return;
    }
    lastActivityAt = atMs ?? Date.now();
    armed = true;
  };

  const touch = (atMs?: number) => {
    if (stopped) {
      return;
    }
    lastActivityAt = atMs ?? Date.now();
  };

  const check = () => {
    if (!armed || stopped) {
      return;
    }
    const now = Date.now();
    const idleMs = now - lastActivityAt;
    if (idleMs < timeoutMs) {
      return;
    }
    // 在调用 onTimeout 之前解除武装，避免重试或 teardown 在同一空闲区间内再次触发超时
    disarm();
    params.runtime?.error?.(
      `[${params.label}] transport watchdog timeout: idle ${Math.round(idleMs / 1000)}s (limit ${Math.round(timeoutMs / 1000)}s)`,
    );
    params.onTimeout({ idleMs, timeoutMs });
  };

  if (params.abortSignal?.aborted) {
    stop();
  } else {
    params.abortSignal?.addEventListener("abort", stop, { once: true });
    timer = setInterval(check, checkIntervalMs);
    timer.unref?.();
  }

  return {
    arm,
    touch,
    disarm,
    stop,
    isArmed: () => armed,
  };
}
