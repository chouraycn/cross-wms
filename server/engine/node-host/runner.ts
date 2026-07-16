import { logger } from '../../logger.js';
import { invokeNode } from './invoke.js';
import type { NodeHostConfig } from './config.js';
import type { InvokeParams } from './invoke.js';

export type NodeTaskResult = {
  success: boolean;
  results: Array<{ task: string; result?: Awaited<ReturnType<typeof invokeNode>>; error?: string }>;
  totalDurationMs: number;
};

export async function runNodeTask(
  config: NodeHostConfig,
  tasks: InvokeParams[],
): Promise<NodeTaskResult> {
  const startTime = Date.now();
  logger.info(`[NodeHost:Runner] Running ${tasks.length} task(s) on node ${config.nodeId}`);

  const results: NodeTaskResult['results'] = [];

  for (const task of tasks) {
    try {
      const result = await invokeNode(config, task);
      results.push({ task: task.command, result });
      if (result.exitCode !== 0) {
        logger.warn(`[NodeHost:Runner] Task ${task.command} exited with code ${result.exitCode}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[NodeHost:Runner] Task ${task.command} failed: ${errorMsg}`);
      results.push({ task: task.command, error: errorMsg });
    }
  }

  const success = results.every(r => r.error === undefined && r.result?.exitCode === 0);

  return {
    success,
    results,
    totalDurationMs: Date.now() - startTime,
  };
}
