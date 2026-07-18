import { logger } from '../../logger.js';

export type PostAttachContext = {
  startTime: number;
  config: Record<string, unknown>;
  server: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  stage: string;
  metadata: Record<string, unknown>;
};

export type PostAttachTask = {
  name: string;
  priority: number;
  run: (context: PostAttachContext) => Promise<void> | void;
  required?: boolean;
  disabled?: boolean;
};

const postAttachTasks = new Map<string, PostAttachTask>();

export function registerPostAttachTask(task: PostAttachTask): void {
  postAttachTasks.set(task.name, task);
  logger.debug(`[Gateway] Registered post-attach task: ${task.name}`);
}

export function unregisterPostAttachTask(name: string): boolean {
  return postAttachTasks.delete(name);
}

export function getPostAttachTasks(): PostAttachTask[] {
  return Array.from(postAttachTasks.values()).sort((a, b) => a.priority - b.priority);
}

export function createPostAttachContext(
  server: Record<string, unknown>,
  config: Record<string, unknown> = {},
): PostAttachContext {
  return {
    startTime: Date.now(),
    config,
    server,
    warnings: [],
    errors: [],
    stage: 'init',
    metadata: {},
  };
}

export async function runPostAttachStartup(
  server: Record<string, unknown>,
  config?: Record<string, unknown>,
): Promise<PostAttachContext> {
  const context = createPostAttachContext(server, config);
  logger.info('[Gateway] Running post-attach startup tasks...');

  const tasks = getPostAttachTasks();
  logger.debug(`[Gateway] Found ${tasks.length} post-attach startup tasks`);

  for (const task of tasks) {
    if (task.disabled) {
      logger.debug(`[Gateway] Skipping disabled post-attach task: ${task.name}`);
      continue;
    }

    context.stage = task.name;
    logger.debug(`[Gateway] Running post-attach task: ${task.name}`);

    try {
      const taskStartTime = Date.now();
      await Promise.resolve(task.run(context));
      const taskDuration = Date.now() - taskStartTime;
      logger.debug(`[Gateway] Post-attach task ${task.name} completed in ${taskDuration}ms`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error(`[Gateway] Post-attach task ${task.name} failed:`, err);

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
    `[Gateway] Post-attach startup complete in ${totalDuration}ms (${context.warnings.length} warnings, ${context.errors.length} errors)`,
  );

  if (context.warnings.length > 0) {
    for (const warning of context.warnings) {
      logger.warn(`[Gateway] Startup warning: ${warning}`);
    }
  }

  return context;
}

export function clearPostAttachTasks(): void {
  postAttachTasks.clear();
}
