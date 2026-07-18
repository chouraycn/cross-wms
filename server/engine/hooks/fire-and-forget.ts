import { logger } from '../../logger.js';
import type { FireAndForgetBoundedHookOptions } from './types.js';

const DEFAULT_MAX_CONCURRENT_FIRE_AND_FORGET_HOOKS = 16;
const DEFAULT_MAX_QUEUED_FIRE_AND_FORGET_HOOKS = 256;
const DEFAULT_FIRE_AND_FORGET_HOOK_TIMEOUT_MS = 2_000;
const MAX_HOOK_LOG_MESSAGE_LENGTH = 500;
const MAX_TIMER_TIMEOUT_MS = 2_147_483_647;

type FireAndForgetHookJob = {
  task: () => Promise<unknown>;
  label: string;
  loggerFn: (message: string) => void;
  timeoutMs: number;
};

type FireAndForgetHookState = {
  active: number;
  queue: FireAndForgetHookJob[];
};

const FIRE_AND_FORGET_STATE_KEY = Symbol.for('cdf-know.fireAndForgetHookState');

function getFireAndForgetHookState(): FireAndForgetHookState {
  const store = globalThis as Record<symbol, FireAndForgetHookState>;
  if (!store[FIRE_AND_FORGET_STATE_KEY]) {
    store[FIRE_AND_FORGET_STATE_KEY] = {
      active: 0,
      queue: [],
    };
  }
  return store[FIRE_AND_FORGET_STATE_KEY];
}

function positiveIntegerOrDefault(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

function resolveTimerTimeoutMs(value: number, minValue: number): number {
  if (!Number.isFinite(value) || value < minValue) {
    return minValue;
  }
  if (value > MAX_TIMER_TIMEOUT_MS) {
    return MAX_TIMER_TIMEOUT_MS;
  }
  return Math.floor(value);
}

function resolveFireAndForgetHookTimeoutMs(value: number | undefined): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return resolveTimerTimeoutMs(value, 1);
  }
  return resolveTimerTimeoutMs(DEFAULT_FIRE_AND_FORGET_HOOK_TIMEOUT_MS, 1);
}

function replaceLogControlCharacters(value: string): string {
  let result = '';
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      codePoint === 0x2028 ||
      codePoint === 0x2029
    ) {
      result += ' ';
      continue;
    }
    result += char;
  }
  return result;
}

function redactSecrets(message: string): string {
  return message
    .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***')
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***')
    .replace(/password["\s:=]+["']?[^"'\s]+/gi, 'password=***')
    .replace(/api[_-]?key["\s:=]+["']?[^"'\s]+/gi, 'api_key=***')
    .replace(/token["\s:=]+["']?[^"'\s]+/gi, 'token=***');
}

export function formatHookErrorForLog(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const formatted = replaceLogControlCharacters(redactSecrets(message))
    .replace(/\s+/g, ' ')
    .trim();
  return (formatted || 'unknown error').slice(0, MAX_HOOK_LOG_MESSAGE_LENGTH);
}

export function fireAndForgetHook(
  task: Promise<unknown>,
  label: string,
  loggerFn: (message: string) => void = (msg) => logger.debug(msg),
): void {
  void task.catch((err: unknown) => {
    loggerFn(`${label}: ${formatHookErrorForLog(err)}`);
  });
}

function runFireAndForgetHookJob(
  state: FireAndForgetHookState,
  job: FireAndForgetHookJob,
  limits: { maxConcurrency: number },
): void {
  state.active += 1;
  let didLogTimeout = false;
  const timeout =
    job.timeoutMs > 0
      ? setTimeout(() => {
          didLogTimeout = true;
          job.loggerFn(`${job.label}: timed out after ${job.timeoutMs}ms`);
        }, job.timeoutMs)
      : undefined;

  void Promise.resolve()
    .then(job.task)
    .catch((err: unknown) => {
      if (!didLogTimeout) {
        job.loggerFn(`${job.label}: ${formatHookErrorForLog(err)}`);
      }
    })
    .finally(() => {
      if (timeout) {
        clearTimeout(timeout);
      }
      state.active -= 1;
      drainFireAndForgetHookQueue(state, limits);
    });
}

function drainFireAndForgetHookQueue(
  state: FireAndForgetHookState,
  limits: { maxConcurrency: number },
): void {
  while (state.active < limits.maxConcurrency) {
    const next = state.queue.shift();
    if (!next) {
      return;
    }
    runFireAndForgetHookJob(state, next, limits);
  }
}

export function fireAndForgetBoundedHook(
  task: () => Promise<unknown>,
  label: string,
  loggerFn: (message: string) => void = (msg) => logger.debug(msg),
  options: FireAndForgetBoundedHookOptions = {},
): void {
  const state = getFireAndForgetHookState();
  const maxConcurrency = positiveIntegerOrDefault(
    options.maxConcurrency,
    DEFAULT_MAX_CONCURRENT_FIRE_AND_FORGET_HOOKS,
  );
  const maxQueue = positiveIntegerOrDefault(
    options.maxQueue,
    DEFAULT_MAX_QUEUED_FIRE_AND_FORGET_HOOKS,
  );
  const timeoutMs = resolveFireAndForgetHookTimeoutMs(options.timeoutMs);

  if (state.active >= maxConcurrency && state.queue.length >= maxQueue) {
    loggerFn(`${label}: queue full; dropping hook`);
    return;
  }

  state.queue.push({ task, label, loggerFn, timeoutMs });
  drainFireAndForgetHookQueue(state, { maxConcurrency });
}

export function getFireAndForgetQueueSize(): number {
  return getFireAndForgetHookState().queue.length;
}

export function getFireAndForgetActiveCount(): number {
  return getFireAndForgetHookState().active;
}

export function resetFireAndForgetStateForTest(): void {
  const state = getFireAndForgetHookState();
  state.active = 0;
  state.queue = [];
}
