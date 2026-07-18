import { logger } from '../../logger.js';
import { invokeNode } from './invoke.js';
import type { NodeHostConfig } from './config.js';
import type { InvokeParams, InvokeResult } from './invoke.js';
import { PermissionChecker } from './permission-checker.js';
import { ResourceMonitor } from './resource-monitor.js';
import { InvocationQueue } from './invocation-queue.js';
import type {
  Invocation,
  ExecutionResult,
  ResourceUsage,
} from './types';

export type NodeTaskResult = {
  success: boolean;
  results: Array<{ task: string; result?: InvokeResult; error?: string }>;
  totalDurationMs: number;
};

export type EnhancedRunnerOptions = {
  maxConcurrentTasks?: number;
  maxQueueSize?: number;
  enableResourceMonitoring?: boolean;
  maxMemoryMB?: number;
  maxCpuPercent?: number;
  defaultTimeoutMs?: number;
};

export class NodeHostRunner {
  private config: NodeHostConfig;
  private permissionChecker: PermissionChecker;
  private resourceMonitor: ResourceMonitor | null = null;
  private queue: InvocationQueue;
  private options: Required<EnhancedRunnerOptions>;
  private activeInvocations = new Map<string, Invocation>();

  constructor(config: NodeHostConfig, options: EnhancedRunnerOptions = {}) {
    this.config = config;
    this.options = {
      maxConcurrentTasks: options.maxConcurrentTasks ?? config.maxConcurrentInvocations ?? 5,
      maxQueueSize: options.maxQueueSize ?? 100,
      enableResourceMonitoring: options.enableResourceMonitoring ?? false,
      maxMemoryMB: options.maxMemoryMB ?? config.maxMemoryMB ?? 1024,
      maxCpuPercent: options.maxCpuPercent ?? config.maxCpuPercent ?? 80,
      defaultTimeoutMs: options.defaultTimeoutMs ?? config.timeoutMs ?? 30_000,
    };

    this.permissionChecker = new PermissionChecker({ defaultEffect: 'allow' });
    this.setupDefaultPermissions();

    this.queue = new InvocationQueue({
      maxSize: this.options.maxQueueSize,
      maxConcurrent: this.options.maxConcurrentTasks,
      defaultTimeoutMs: this.options.defaultTimeoutMs,
    });

    if (this.options.enableResourceMonitoring) {
      this.resourceMonitor = new ResourceMonitor({
        maxMemoryMB: this.options.maxMemoryMB,
        maxCpuPercent: this.options.maxCpuPercent,
        sampleIntervalMs: 500,
      });
    }
  }

  private setupDefaultPermissions(): void {
    if (this.config.allowedCommands && this.config.allowedCommands.length > 0) {
      this.permissionChecker = new PermissionChecker({ defaultEffect: 'deny' });
      for (const cmd of this.config.allowedCommands) {
        this.permissionChecker.addPermission({
          action: 'execute',
          resource: `command:${cmd}`,
          effect: 'allow',
        });
      }
    }

    if (this.config.deniedCommands) {
      for (const cmd of this.config.deniedCommands) {
        this.permissionChecker.addPermission({
          action: 'execute',
          resource: `command:${cmd}`,
          effect: 'deny',
        });
      }
    }
  }

  async runTask(task: InvokeParams): Promise<InvokeResult> {
    return invokeNode(this.config, task);
  }

  async runTasks(tasks: InvokeParams[]): Promise<NodeTaskResult> {
    const startTime = Date.now();
    logger.info(`[NodeHost:Runner] Running ${tasks.length} task(s) on node ${this.config.nodeId}`);

    const results: NodeTaskResult['results'] = [];

    for (const task of tasks) {
      try {
        const result = await invokeNode(this.config, task);
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

  async enqueueTask(task: InvokeParams, priority?: number): Promise<ExecutionResult> {
    const permissionCheck = this.permissionChecker.check('execute', `command:${task.command}`);
    if (!permissionCheck.allowed) {
      throw new Error(`Permission denied for command: ${task.command}`);
    }

    return this.queue.enqueue(
      {
        command: task.command,
        args: task.args ?? [],
        cwd: task.cwd,
        env: task.env,
        timeoutMs: task.timeoutMs,
        stdin: task.stdin,
        priority,
      },
      async () => this.executeWithMonitoring(task),
    );
  }

  private async executeWithMonitoring(task: InvokeParams): Promise<ExecutionResult> {
    const invocationId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const startTime = Date.now();

    const invocation: Invocation = {
      id: invocationId,
      command: task.command,
      args: task.args ?? [],
      cwd: task.cwd,
      env: task.env,
      timeoutMs: task.timeoutMs,
      stdin: task.stdin,
      createdAt: startTime,
      startedAt: startTime,
      status: 'running',
    };
    this.activeInvocations.set(invocationId, invocation);

    try {
      const result = await invokeNode(this.config, task);
      invocation.completedAt = Date.now();
      invocation.status = result.exitCode === 0 ? 'completed' : 'failed';

      const durationMs = Date.now() - startTime;

      return {
        invocationId,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        signal: result.signal,
        durationMs,
        timedOut: false,
        success: result.exitCode === 0,
        truncated: false,
        resourceUsage: this.getCurrentResourceUsage(durationMs),
      };
    } catch (err) {
      invocation.completedAt = Date.now();
      invocation.status = 'failed';

      const errorMsg = err instanceof Error ? err.message : String(err);
      const durationMs = Date.now() - startTime;

      return {
        invocationId,
        exitCode: 1,
        stdout: '',
        stderr: errorMsg,
        durationMs,
        timedOut: errorMsg.includes('timed out') || errorMsg.includes('timeout'),
        success: false,
        error: errorMsg,
        truncated: false,
        resourceUsage: this.getCurrentResourceUsage(durationMs),
      };
    } finally {
      this.activeInvocations.delete(invocationId);
    }
  }

  private getCurrentResourceUsage(durationMs: number): ResourceUsage {
    const usage: ResourceUsage = {
      wallTimeMs: durationMs,
    };

    if (this.resourceMonitor) {
      const snapshot = this.resourceMonitor.getCurrentSnapshot();
      if (snapshot) {
        usage.memoryBytes = snapshot.memoryBytes;
        usage.cpuPercent = snapshot.cpuPercent;
      }
    }

    return usage;
  }

  cancelTask(invocationId: string): boolean {
    return this.queue.cancel(invocationId);
  }

  getQueueStats() {
    return this.queue.getStats();
  }

  getActiveInvocations(): Invocation[] {
    return Array.from(this.activeInvocations.values());
  }

  getActiveCount(): number {
    return this.activeInvocations.size;
  }

  startResourceMonitoring(): void {
    if (this.resourceMonitor) {
      this.resourceMonitor.start();
    }
  }

  stopResourceMonitoring(): void {
    if (this.resourceMonitor) {
      this.resourceMonitor.stop();
    }
  }

  getResourceMonitor(): ResourceMonitor | null {
    return this.resourceMonitor;
  }

  getPermissionChecker(): PermissionChecker {
    return this.permissionChecker;
  }

  getConfig(): NodeHostConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<NodeHostConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

export async function runNodeTask(
  config: NodeHostConfig,
  tasks: InvokeParams[],
): Promise<NodeTaskResult> {
  const runner = new NodeHostRunner(config);
  return runner.runTasks(tasks);
}

export function createNodeHostRunner(
  config: NodeHostConfig,
  options?: EnhancedRunnerOptions,
): NodeHostRunner {
  return new NodeHostRunner(config, options);
}
