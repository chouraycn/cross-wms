/**
 * 并发任务执行工具 — 控制并发数量的异步任务执行器
 * 参考 openclaw/src/utils/run-with-concurrency.ts
 */

export type ConcurrencyErrorMode = "continue" | "stop";

export type RunTasksWithConcurrencyOptions<T> = {
  tasks: Array<() => Promise<T>>;
  limit: number;
  errorMode?: ConcurrencyErrorMode;
  onTaskError?: (error: unknown, index: number) => void;
};

export type RunTasksWithConcurrencyResult<T> = {
  results: T[];
  firstError: unknown;
  hasError: boolean;
};

export async function runTasksWithConcurrency<T>(
  params: RunTasksWithConcurrencyOptions<T>,
): Promise<RunTasksWithConcurrencyResult<T>> {
  const { tasks, limit, onTaskError } = params;
  const errorMode = params.errorMode ?? "continue";
  if (tasks.length === 0) {
    return { results: [], firstError: undefined, hasError: false };
  }

  const resolvedLimit = Math.max(1, Math.min(limit, tasks.length));
  const results: T[] = Array.from({ length: tasks.length });
  let next = 0;
  let firstError: unknown = undefined;
  let hasError = false;

  const workers = Array.from({ length: resolvedLimit }, async () => {
    while (true) {
      if (errorMode === "stop" && hasError) {
        return;
      }
      const index = next;
      next += 1;
      if (index >= tasks.length) {
        return;
      }
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
        onTaskError?.(error, index);
        if (errorMode === "stop") {
          return;
        }
      }
    }
  });

  await Promise.allSettled(workers);
  return { results, firstError, hasError };
}