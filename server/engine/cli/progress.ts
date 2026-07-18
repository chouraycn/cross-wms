// Terminal progress reporter used by long-running CLI commands.
// 移植自 openclaw/src/cli/progress.ts。
//
// 降级策略：
//  - 原模块依赖 @clack/prompts 的 spinner、
//    ../../packages/terminal-core/src/{osc-progress,progress-line,theme}.js。
//    cross-wms 均未移植；降级为 no-op reporter。
//  - 原模块依赖 ../shared/number-coercion.js 的 resolveTimerTimeoutMs。降级内联实现。

// ===== 内联 resolveTimerTimeoutMs stub =====
function resolveTimerTimeoutMs(
  value: number | undefined,
  defaultValue: number,
  _minimum: number,
): number {
  return typeof value === "number" && Number.isFinite(value) ? value : defaultValue;
}
// ===== stub 结束 =====

const DEFAULT_DELAY_MS = 0;
let activeProgress = 0;

type ProgressOptions = {
  label: string;
  indeterminate?: boolean;
  total?: number;
  enabled?: boolean;
  delayMs?: number;
  stream?: NodeJS.WriteStream;
  fallback?: "spinner" | "line" | "log" | "none";
};

/** Minimal progress API exposed to CLI work callbacks. */
export type ProgressReporter = {
  setLabel: (label: string) => void;
  setPercent: (percent: number) => void;
  tick: (delta?: number) => void;
  done: () => void;
};

/** Completed/total progress update shape used by totals-based commands. */
export type ProgressTotalsUpdate = {
  completed: number;
  total: number;
  label?: string;
};

/** Decide whether the interactive spinner is safe for the current terminal state. */
export function shouldUseInteractiveProgressSpinner(params: {
  fallback?: ProgressOptions["fallback"];
  streamIsTty?: boolean;
  stdinIsRaw?: boolean;
}): boolean {
  const spinnerRequested = params.fallback === undefined || params.fallback === "spinner";
  return spinnerRequested && params.streamIsTty === true && params.stdinIsRaw !== true;
}

const noopReporter: ProgressReporter = {
  setLabel: () => {},
  setPercent: () => {},
  tick: () => {},
  done: () => {},
};

/**
 * Create a progress reporter.
 *
 * 降级实现：terminal-core 的 spinner/osc-progress/progress-line/theme 均未移植。
 * 这里降级为 no-op reporter，保留函数签名以便未来替换为正式实现。
 */
export function createCliProgress(options: ProgressOptions): ProgressReporter {
  void options;
  if (activeProgress > 0) {
    return noopReporter;
  }
  activeProgress += 1;
  let stopped = false;
  return {
    setLabel: () => {},
    setPercent: () => {},
    tick: () => {},
    done: () => {
      if (stopped) {
        return;
      }
      stopped = true;
      activeProgress = Math.max(0, activeProgress - 1);
    },
  };
}

/** Run async work with a progress reporter that is always stopped in finally. */
export async function withProgress<T>(
  options: ProgressOptions,
  work: (progress: ProgressReporter) => Promise<T>,
): Promise<T> {
  const progress = createCliProgress(options);
  try {
    return await work(progress);
  } finally {
    progress.done();
  }
}

/** Run async work with a progress reporter plus a completed/total update adapter. */
export async function withProgressTotals<T>(
  options: ProgressOptions,
  work: (update: (update: ProgressTotalsUpdate) => void, progress: ProgressReporter) => Promise<T>,
): Promise<T> {
  return await withProgress(options, async (progress) => {
    const update = ({ completed, total, label }: ProgressTotalsUpdate) => {
      if (label) {
        progress.setLabel(label);
      }
      if (!Number.isFinite(total) || total <= 0) {
        return;
      }
      progress.setPercent((completed / total) * 100);
    };
    return await work(update, progress);
  });
}
