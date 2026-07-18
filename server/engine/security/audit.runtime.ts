import { logger } from '../../logger.js';
import type { SecurityFinding, SecuritySummary } from './types.js';

export type AuditRuntimeState = 'idle' | 'running' | 'completed' | 'error';

export type AuditRuntimeStatus = {
  state: AuditRuntimeState;
  progress: number;
  currentTask: string;
  startTime?: number;
  endTime?: number;
  error?: string;
};

export type AuditRuntimeResult = {
  findings: SecurityFinding[];
  summary: SecuritySummary;
  status: AuditRuntimeStatus;
  durationMs: number;
};

export type AuditTask = {
  id: string;
  name: string;
  category: 'deep' | 'non-deep';
  weight: number;
  run: () => Promise<SecurityFinding[]>;
};

export type AuditRuntimeConfig = {
  maxConcurrentTasks: number;
  timeoutMs: number;
  enableDeepAudit: boolean;
  enableNonDeepAudit: boolean;
};

const DEFAULT_CONFIG: AuditRuntimeConfig = {
  maxConcurrentTasks: 4,
  timeoutMs: 30000,
  enableDeepAudit: true,
  enableNonDeepAudit: true,
};

let currentConfig = DEFAULT_CONFIG;
let currentStatus: AuditRuntimeStatus = { state: 'idle', progress: 0, currentTask: '' };
let pendingTasks: AuditTask[] = [];

export function getAuditRuntimeConfig(): AuditRuntimeConfig {
  return { ...currentConfig };
}

export function setAuditRuntimeConfig(config: Partial<AuditRuntimeConfig>): void {
  currentConfig = { ...currentConfig, ...config };
  logger.debug(`[Security:AuditRuntime] Updated config: ${JSON.stringify(currentConfig)}`);
}

export function getAuditRuntimeStatus(): AuditRuntimeStatus {
  return { ...currentStatus };
}

export function registerAuditTask(task: AuditTask): void {
  const existingIndex = pendingTasks.findIndex(t => t.id === task.id);
  if (existingIndex >= 0) {
    pendingTasks[existingIndex] = task;
  } else {
    pendingTasks.push(task);
  }
  logger.debug(`[Security:AuditRuntime] Registered task: ${task.id}`);
}

export function registerAuditTasks(tasks: AuditTask[]): void {
  for (const task of tasks) {
    registerAuditTask(task);
  }
}

export function unregisterAuditTask(taskId: string): boolean {
  const initialLength = pendingTasks.length;
  pendingTasks = pendingTasks.filter(t => t.id !== taskId);
  return pendingTasks.length !== initialLength;
}

export function clearAuditTasks(): void {
  pendingTasks = [];
  logger.debug('[Security:AuditRuntime] Cleared all tasks');
}

export function listAuditTasks(): AuditTask[] {
  return [...pendingTasks];
}

export function filterAuditTasksByCategory(category: 'deep' | 'non-deep'): AuditTask[] {
  return pendingTasks.filter(t => t.category === category);
}

function updateStatus(state: AuditRuntimeState, currentTask?: string, progress?: number): void {
  currentStatus = {
    ...currentStatus,
    state,
    currentTask: currentTask ?? currentStatus.currentTask,
    progress: progress ?? currentStatus.progress,
  };
}

export async function runAuditTasks(config?: Partial<AuditRuntimeConfig>): Promise<AuditRuntimeResult> {
  const effectiveConfig = { ...currentConfig, ...(config || {}) };
  const startTime = Date.now();

  updateStatus('running', 'initializing', 0);

  const tasksToRun = pendingTasks.filter(task => {
    if (task.category === 'deep' && !effectiveConfig.enableDeepAudit) return false;
    if (task.category === 'non-deep' && !effectiveConfig.enableNonDeepAudit) return false;
    return true;
  });

  if (tasksToRun.length === 0) {
    updateStatus('completed', 'no tasks', 100);
    return {
      findings: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      status: getAuditRuntimeStatus(),
      durationMs: Date.now() - startTime,
    };
  }

  const totalWeight = tasksToRun.reduce((sum, t) => sum + t.weight, 0);
  const allFindings: SecurityFinding[] = [];
  let completedWeight = 0;

  const taskQueue = [...tasksToRun];
  const runningPromises: Promise<void>[] = [];

  while (taskQueue.length > 0 || runningPromises.length > 0) {
    while (runningPromises.length < effectiveConfig.maxConcurrentTasks && taskQueue.length > 0) {
      const task = taskQueue.shift()!;
      updateStatus('running', task.name);

      const promise = (async () => {
        try {
          logger.debug(`[Security:AuditRuntime] Running task: ${task.id}`);
          const findings = await Promise.race([
            task.run(),
            new Promise<SecurityFinding[]>((_, reject) =>
              setTimeout(() => reject(new Error(`Task ${task.id} timed out`)), effectiveConfig.timeoutMs),
            ),
          ]);
          allFindings.push(...findings);
          completedWeight += task.weight;
          const progress = Math.round((completedWeight / totalWeight) * 100);
          updateStatus('running', task.name, progress);
          logger.debug(`[Security:AuditRuntime] Completed task: ${task.id}, found ${findings.length} findings`);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          logger.error(`[Security:AuditRuntime] Task failed: ${task.id}, error: ${errorMessage}`);
          allFindings.push({
            id: `audit-runtime-error-${task.id}`,
            title: `Audit task failed: ${task.name}`,
            severity: 'medium',
            category: 'config',
            description: `Task ${task.id} failed with error: ${errorMessage}`,
            recommendation: 'Check task configuration and dependencies',
            metadata: { taskId: task.id, taskName: task.name, error: errorMessage },
          });
          completedWeight += task.weight;
          const progress = Math.round((completedWeight / totalWeight) * 100);
          updateStatus('running', task.name, progress);
        }
      })();

      runningPromises.push(promise);
      promise.then(() => {
        const index = runningPromises.indexOf(promise);
        if (index >= 0) runningPromises.splice(index, 1);
      });
    }

    if (runningPromises.length > 0) {
      await Promise.race(runningPromises);
    }
  }

  const summary: SecuritySummary = {
    critical: allFindings.filter(f => f.severity === 'critical').length,
    high: allFindings.filter(f => f.severity === 'high').length,
    medium: allFindings.filter(f => f.severity === 'medium').length,
    low: allFindings.filter(f => f.severity === 'low').length,
    info: allFindings.filter(f => f.severity === 'info').length,
    total: allFindings.length,
  };

  updateStatus('completed', 'done', 100);
  currentStatus.endTime = Date.now();

  const durationMs = Date.now() - startTime;

  logger.info(
    `[Security:AuditRuntime] Audit completed in ${durationMs}ms: ${summary.total} findings (${summary.critical} critical, ${summary.high} high)`,
  );

  return { findings: allFindings, summary, status: getAuditRuntimeStatus(), durationMs };
}

export async function runSingleTask(taskId: string): Promise<SecurityFinding[]> {
  const task = pendingTasks.find(t => t.id === taskId);
  if (!task) {
    logger.warn(`[Security:AuditRuntime] Task not found: ${taskId}`);
    return [];
  }

  updateStatus('running', task.name, 0);

  try {
    const findings = await task.run();
    updateStatus('completed', task.name, 100);
    return findings;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    updateStatus('error', task.name, 0);
    currentStatus.error = errorMessage;
    logger.error(`[Security:AuditRuntime] Single task failed: ${taskId}, error: ${errorMessage}`);
    return [];
  }
}

export function resetAuditRuntime(): void {
  currentStatus = { state: 'idle', progress: 0, currentTask: '' };
  logger.debug('[Security:AuditRuntime] Reset');
}