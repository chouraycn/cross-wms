import { logger } from '../../logger.js';

export type StartupTask = {
  id: string;
  name: string;
  description?: string;
  priority: number;
  run: () => Promise<void> | void;
  required?: boolean;
  disabled?: boolean;
  timeoutMs?: number;
  dependsOn?: string[];
};

export type StartupTaskResult = {
  id: string;
  success: boolean;
  durationMs: number;
  error?: string;
  skipped?: boolean;
  skippedReason?: string;
};

export type StartupTaskSummary = {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
  results: StartupTaskResult[];
  success: boolean;
};

const startupTasks = new Map<string, StartupTask>();

export function registerStartupTask(task: StartupTask): void {
  startupTasks.set(task.id, task);
  logger.debug(`[Gateway] Registered startup task: ${task.id}`);
}

export function unregisterStartupTask(id: string): boolean {
  return startupTasks.delete(id);
}

export function getStartupTask(id: string): StartupTask | undefined {
  return startupTasks.get(id);
}

export function listStartupTasks(): StartupTask[] {
  return Array.from(startupTasks.values()).sort((a, b) => a.priority - b.priority);
}

function resolveTaskOrder(tasks: StartupTask[]): StartupTask[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const resolved: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(id: string): boolean {
    if (visited.has(id)) return true;
    if (visiting.has(id)) return false;

    visiting.add(id);
    const task = taskMap.get(id);
    if (task?.dependsOn) {
      for (const dep of task.dependsOn) {
        if (!visit(dep)) return false;
      }
    }
    visiting.delete(id);
    visited.add(id);
    resolved.push(id);
    return true;
  }

  for (const task of tasks) {
    if (!visit(task.id)) {
      return tasks.sort((a, b) => a.priority - b.priority);
    }
  }

  return resolved
    .map((id) => taskMap.get(id)!)
    .filter(Boolean)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return 0;
    });
}

async function runTaskWithTimeout(
  task: StartupTask,
): Promise<{ success: boolean; error?: string; durationMs: number }> {
  const startTime = Date.now();

  if (task.timeoutMs) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({
          success: false,
          error: `timeout after ${task.timeoutMs}ms`,
          durationMs: Date.now() - startTime,
        });
      }, task.timeoutMs);

      Promise.resolve()
        .then(() => task.run())
        .then(() => {
          clearTimeout(timeout);
          resolve({
            success: true,
            durationMs: Date.now() - startTime,
          });
        })
        .catch((err) => {
          clearTimeout(timeout);
          resolve({
            success: false,
            error: err instanceof Error ? err.message : String(err),
            durationMs: Date.now() - startTime,
          });
        });
    });
  }

  try {
    await Promise.resolve(task.run());
    return {
      success: true,
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startTime,
    };
  }
}

export async function runStartupTasks(): Promise<StartupTaskSummary> {
  const startTime = Date.now();
  const results: StartupTaskResult[] = [];
  const completed = new Set<string>();

  logger.info('[Gateway] Running startup tasks...');

  const tasks = resolveTaskOrder(listStartupTasks());
  logger.debug(`[Gateway] Found ${tasks.length} startup tasks`);

  for (const task of tasks) {
    if (task.disabled) {
      results.push({
        id: task.id,
        success: false,
        durationMs: 0,
        skipped: true,
        skippedReason: 'disabled',
      });
      continue;
    }

    if (task.dependsOn && task.dependsOn.length > 0) {
      const missingDeps = task.dependsOn.filter((dep) => !completed.has(dep));
      if (missingDeps.length > 0) {
        results.push({
          id: task.id,
          success: false,
          durationMs: 0,
          skipped: true,
          skippedReason: `missing dependencies: ${missingDeps.join(', ')}`,
        });
        if (task.required) {
          logger.error(
            `[Gateway] Required task ${task.id} skipped due to missing dependencies`,
          );
        }
        continue;
      }
    }

    logger.debug(`[Gateway] Running startup task: ${task.id}`);
    const result = await runTaskWithTimeout(task);

    results.push({
      id: task.id,
      success: result.success,
      durationMs: result.durationMs,
      error: result.error,
    });

    if (result.success) {
      completed.add(task.id);
      logger.debug(`[Gateway] Startup task ${task.id} completed in ${result.durationMs}ms`);
    } else {
      logger.error(
        `[Gateway] Startup task ${task.id} failed: ${result.error}`,
      );
      if (task.required) {
        break;
      }
    }
  }

  const totalDuration = Date.now() - startTime;
  const failedCount = results.filter((r) => !r.success && !r.skipped).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const completedCount = results.filter((r) => r.success).length;
  const success = failedCount === 0 && results.some((r) => r.success);

  logger.info(
    `[Gateway] Startup tasks complete in ${totalDuration}ms (${completedCount} completed, ${failedCount} failed, ${skippedCount} skipped)`,
  );

  return {
    total: tasks.length,
    completed: completedCount,
    failed: failedCount,
    skipped: skippedCount,
    totalDurationMs: totalDuration,
    results,
    success,
  };
}

export function clearStartupTasks(): void {
  startupTasks.clear();
}
