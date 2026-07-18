import { logger } from '../../logger.js';

export type EarlyStartupContext = {
  startTime: number;
  config: Record<string, unknown>;
  env: NodeJS.ProcessEnv;
  warnings: string[];
  errors: string[];
  stage: string;
  metadata: Record<string, unknown>;
};

export type EarlyStartupTask = {
  name: string;
  priority: number;
  run: (context: EarlyStartupContext) => Promise<void> | void;
  required?: boolean;
  disabled?: boolean;
};

const earlyStartupTasks = new Map<string, EarlyStartupTask>();

export function registerEarlyStartupTask(task: EarlyStartupTask): void {
  earlyStartupTasks.set(task.name, task);
  logger.debug(`[Gateway] Registered early startup task: ${task.name}`);
}

export function unregisterEarlyStartupTask(name: string): boolean {
  return earlyStartupTasks.delete(name);
}

export function getEarlyStartupTasks(): EarlyStartupTask[] {
  return Array.from(earlyStartupTasks.values()).sort((a, b) => a.priority - b.priority);
}

export function createEarlyStartupContext(
  config: Record<string, unknown> = {},
): EarlyStartupContext {
  return {
    startTime: Date.now(),
    config,
    env: process.env,
    warnings: [],
    errors: [],
    stage: 'init',
    metadata: {},
  };
}

export async function runEarlyStartup(
  config?: Record<string, unknown>,
): Promise<EarlyStartupContext> {
  const context = createEarlyStartupContext(config);
  logger.info('[Gateway] Running early startup tasks...');

  const tasks = getEarlyStartupTasks();
  logger.debug(`[Gateway] Found ${tasks.length} early startup tasks`);

  for (const task of tasks) {
    if (task.disabled) {
      logger.debug(`[Gateway] Skipping disabled early startup task: ${task.name}`);
      continue;
    }

    context.stage = task.name;
    logger.debug(`[Gateway] Running early startup task: ${task.name}`);

    try {
      const taskStartTime = Date.now();
      await Promise.resolve(task.run(context));
      const taskDuration = Date.now() - taskStartTime;
      logger.debug(`[Gateway] Early startup task ${task.name} completed in ${taskDuration}ms`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Gateway] Early startup task ${task.name} failed:`, err);

      if (task.required) {
        context.errors.push(`Required task ${task.name} failed: ${errorMessage}`);
        throw err;
      } else {
        context.warnings.push(`Task ${task.name} failed: ${errorMessage}`);
      }
    }
  }

  const totalDuration = Date.now() - context.startTime;
  context.stage = 'complete';

  logger.info(
    `[Gateway] Early startup complete in ${totalDuration}ms (${context.warnings.length} warnings, ${context.errors.length} errors)`,
  );

  if (context.warnings.length > 0) {
    for (const warning of context.warnings) {
      logger.warn(`[Gateway] Startup warning: ${warning}`);
    }
  }

  return context;
}

export function clearEarlyStartupTasks(): void {
  earlyStartupTasks.clear();
}
