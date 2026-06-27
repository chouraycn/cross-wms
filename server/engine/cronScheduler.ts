/**
 * Cron Scheduler
 * Cron 调度器 - 完整的定时任务调度系统
 */

export type CronJobStatus = "active" | "paused" | "completed" | "failed" | "disabled";

export interface CronJob {
  id: string;
  name: string;
  description?: string;
  cronExpression: string;
  taskType: string;
  taskParams: Record<string, unknown>;
  sessionKey?: string;
  agent?: string;
  timezone?: string;
  status: CronJobStatus;
  enabled: boolean;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  lastRunAt?: number;
  nextRunAt?: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  consecutiveFailures: number;
  totalRuns: number;
  totalSuccesses: number;
  totalFailures: number;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface CronExecutionResult {
  jobId: string;
  runId: string;
  startedAt: number;
  completedAt: number;
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  retryCount: number;
}

export interface CronSchedulerOptions {
  maxConcurrentJobs?: number;
  checkIntervalMs?: number;
  timezone?: string;
}

const DEFAULT_MAX_CONCURRENT = 5;
const DEFAULT_CHECK_INTERVAL = 1000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5000;

type TaskExecutor = (params: Record<string, unknown>, context: { jobId: string; sessionKey?: string }) => Promise<unknown>;

class CronScheduler {
  private readonly jobs = new Map<string, CronJob>();
  private readonly executors = new Map<string, TaskExecutor>();
  private readonly runningJobs = new Map<string, { runId: string; startedAt: number; abort: AbortController }>();
  private readonly runHistory = new Map<string, CronExecutionResult[]>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private options: Required<CronSchedulerOptions>;
  private isRunning = false;

  constructor(options: CronSchedulerOptions = {}) {
    this.options = {
      maxConcurrentJobs: options.maxConcurrentJobs ?? DEFAULT_MAX_CONCURRENT,
      checkIntervalMs: options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL,
      timezone: options.timezone ?? "Asia/Shanghai",
    };
  }

  // ========== Job Management ==========

  createJob(params: {
    name: string;
    cronExpression: string;
    taskType: string;
    taskParams: Record<string, unknown>;
    description?: string;
    sessionKey?: string;
    agent?: string;
    maxRetries?: number;
    retryDelayMs?: number;
    timeoutMs?: number;
    enabled?: boolean;
    metadata?: Record<string, unknown>;
  }): CronJob {
    const now = Date.now();
    const id = `cron_${now}_${Math.random().toString(36).slice(2, 8)}`;

    const job: CronJob = {
      id,
      name: params.name,
      description: params.description,
      cronExpression: params.cronExpression,
      taskType: params.taskType,
      taskParams: params.taskParams,
      sessionKey: params.sessionKey,
      agent: params.agent,
      timezone: this.options.timezone,
      status: params.enabled !== false ? "active" : "disabled",
      enabled: params.enabled !== false,
      maxRetries: params.maxRetries ?? DEFAULT_MAX_RETRIES,
      retryDelayMs: params.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      timeoutMs: params.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      consecutiveFailures: 0,
      totalRuns: 0,
      totalSuccesses: 0,
      totalFailures: 0,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata,
      nextRunAt: this.calculateNextRun(params.cronExpression, now),
    };

    this.jobs.set(id, job);
    return job;
  }

  updateJob(id: string, updates: Partial<CronJob>): CronJob | null {
    const job = this.jobs.get(id);
    if (!job) return null;

    const updated = {
      ...job,
      ...updates,
      id,
      updatedAt: Date.now(),
    };

    if (updates.cronExpression) {
      updated.nextRunAt = this.calculateNextRun(updates.cronExpression, Date.now());
    }

    this.jobs.set(id, updated);
    return updated;
  }

  deleteJob(id: string): boolean {
    this.runningJobs.delete(id);
    this.runHistory.delete(id);
    return this.jobs.delete(id);
  }

  getJob(id: string): CronJob | undefined {
    return this.jobs.get(id);
  }

  listJobs(options?: {
    status?: CronJobStatus;
    enabled?: boolean;
    sessionKey?: string;
    taskType?: string;
  }): CronJob[] {
    let jobs = Array.from(this.jobs.values());

    if (options?.status) {
      jobs = jobs.filter((j) => j.status === options.status);
    }
    if (options?.enabled !== undefined) {
      jobs = jobs.filter((j) => j.enabled === options.enabled);
    }
    if (options?.sessionKey) {
      jobs = jobs.filter((j) => j.sessionKey === options.sessionKey);
    }
    if (options?.taskType) {
      jobs = jobs.filter((j) => j.taskType === options.taskType);
    }

    return jobs.sort((a, b) => (b.nextRunAt ?? 0) - (a.nextRunAt ?? 0));
  }

  // ========== Task Executor ==========

  registerTaskExecutor(taskType: string, executor: TaskExecutor): void {
    this.executors.set(taskType, executor);
  }

  unregisterTaskExecutor(taskType: string): boolean {
    return this.executors.delete(taskType);
  }

  // ========== Scheduler Control ==========

  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.timer = setInterval(() => this.tick(), this.options.checkIntervalMs);
    console.log(`[cron] Scheduler started with ${this.jobs.size} jobs`);
  }

  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log("[cron] Scheduler stopped");
  }

  triggerJob(jobId: string): Promise<CronExecutionResult | null> {
    const job = this.jobs.get(jobId);
    if (!job) return Promise.resolve(null);
    return this.executeJob(job);
  }

  pauseJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = "paused";
    job.updatedAt = Date.now();
    this.jobs.set(jobId, job);
    return true;
  }

  resumeJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    job.status = "active";
    job.updatedAt = Date.now();
    job.nextRunAt = this.calculateNextRun(job.cronExpression, Date.now());
    this.jobs.set(jobId, job);
    return true;
  }

  // ========== Execution ==========

  private async tick(): Promise<void> {
    if (!this.isRunning) return;

    const now = Date.now();
    const dueJobs = this.listJobs({ status: "active" }).filter(
      (job) => job.nextRunAt && job.nextRunAt <= now,
    );

    for (const job of dueJobs) {
      const runningCount = this.runningJobs.size;
      if (runningCount >= this.options.maxConcurrentJobs) {
        continue;
      }

      this.executeJob(job).catch((err) => {
        console.error(`[cron] Job ${job.id} execution error:`, err);
      });
    }
  }

  private async executeJob(job: CronJob): Promise<CronExecutionResult> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const abortController = new AbortController();

    this.runningJobs.set(job.id, { runId, startedAt, abort: abortController });

    let result: CronExecutionResult;
    let retries = 0;

    while (retries <= job.maxRetries) {
      try {
        const executor = this.executors.get(job.taskType);
        if (!executor) {
          throw new Error(`No executor registered for task type: ${job.taskType}`);
        }

        const taskResult = await Promise.race([
          executor(job.taskParams, { jobId: job.id, sessionKey: job.sessionKey }),
          new Promise<never>((_, reject) =>
            setTimeout(() => {
              abortController.abort();
              reject(new Error(`Task timed out after ${job.timeoutMs}ms`));
            }, job.timeoutMs),
          ),
        ]);

        result = {
          jobId: job.id,
          runId,
          startedAt,
          completedAt: Date.now(),
          success: true,
          result: taskResult,
          durationMs: Date.now() - startedAt,
          retryCount: retries,
        };
        break;
      } catch (error) {
        if (retries >= job.maxRetries) {
          result = {
            jobId: job.id,
            runId,
            startedAt,
            completedAt: Date.now(),
            success: false,
            error: error instanceof Error ? error.message : String(error),
            durationMs: Date.now() - startedAt,
            retryCount: retries,
          };
          break;
        }
        retries++;
        await new Promise((resolve) => setTimeout(resolve, job.retryDelayMs * retries));
      }
    }

    result = result!;

    // 更新 job 状态
    const updatedJob = { ...job };
    updatedJob.lastRunAt = startedAt;
    updatedJob.totalRuns++;
    updatedJob.updatedAt = Date.now();

    if (result.success) {
      updatedJob.lastSuccessAt = result.completedAt;
      updatedJob.totalSuccesses++;
      updatedJob.consecutiveFailures = 0;
    } else {
      updatedJob.lastFailureAt = result.completedAt;
      updatedJob.totalFailures++;
      updatedJob.consecutiveFailures++;
    }

    updatedJob.nextRunAt = this.calculateNextRun(job.cronExpression, Date.now());
    this.jobs.set(job.id, updatedJob);

    // 记录运行历史
    const history = this.runHistory.get(job.id) ?? [];
    history.push(result);
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    this.runHistory.set(job.id, history);

    this.runningJobs.delete(job.id);

    return result;
  }

  // ========== Cron Parsing ==========

  private calculateNextRun(cronExpression: string, fromTime: number): number {
    // 简化的 cron 表达式解析
    // 支持: "* * * * *" (分钟 小时 日 月 周)
    const parts = cronExpression.trim().split(/\s+/);
    if (parts.length !== 5) {
      return fromTime + 60000; // 默认 1 分钟后
    }

    const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
    const now = new Date(fromTime);
    const next = new Date(fromTime);
    next.setSeconds(0, 0);
    next.setMinutes(next.getMinutes() + 1);

    // 简化：只支持 * 和数字
    for (let i = 0; i < 525600; i++) {
      // 最多检查一年
      if (this.matchesCronField(minute, next.getMinutes()) &&
          this.matchesCronField(hour, next.getHours()) &&
          this.matchesCronField(dayOfMonth, next.getDate()) &&
          this.matchesCronField(month, next.getMonth() + 1) &&
          this.matchesCronField(dayOfWeek, next.getDay())) {
        return next.getTime();
      }
      next.setMinutes(next.getMinutes() + 1);
    }

    return fromTime + 60000;
  }

  private matchesCronField(field: string, value: number): boolean {
    if (field === "*") return true;

    // 支持逗号分隔的列表
    if (field.includes(",")) {
      return field.split(",").some((part) => this.matchesCronField(part.trim(), value));
    }

    // 支持范围
    if (field.includes("-")) {
      const [start, end] = field.split("-").map(Number);
      return value >= start && value <= end;
    }

    // 支持步长
    if (field.startsWith("*/")) {
      const step = parseInt(field.slice(2), 10);
      return value % step === 0;
    }

    return parseInt(field, 10) === value;
  }

  // ========== Stats & History ==========

  getRunHistory(jobId: string, limit = 20): CronExecutionResult[] {
    const history = this.runHistory.get(jobId) ?? [];
    return [...history].reverse().slice(0, limit);
  }

  getStats(): {
    totalJobs: number;
    activeJobs: number;
    runningJobs: number;
    totalRuns: number;
    totalSuccesses: number;
    totalFailures: number;
    successRate: number;
  } {
    const jobs = Array.from(this.jobs.values());
    const totalRuns = jobs.reduce((sum, j) => sum + j.totalRuns, 0);
    const totalSuccesses = jobs.reduce((sum, j) => sum + j.totalSuccesses, 0);
    const totalFailures = jobs.reduce((sum, j) => sum + j.totalFailures, 0);

    return {
      totalJobs: jobs.length,
      activeJobs: jobs.filter((j) => j.status === "active").length,
      runningJobs: this.runningJobs.size,
      totalRuns,
      totalSuccesses,
      totalFailures,
      successRate: totalRuns > 0 ? totalSuccesses / totalRuns : 0,
    };
  }

  clear(): void {
    this.stop();
    this.jobs.clear();
    this.executors.clear();
    this.runningJobs.clear();
    this.runHistory.clear();
  }
}

const CRON_SCHEDULER_INSTANCE = new CronScheduler();

export function getCronScheduler(): CronScheduler {
  return CRON_SCHEDULER_INSTANCE;
}

export function startCronScheduler(): void {
  CRON_SCHEDULER_INSTANCE.start();
}

export function stopCronScheduler(): void {
  CRON_SCHEDULER_INSTANCE.stop();
}

export function registerCronTask(taskType: string, executor: TaskExecutor): void {
  CRON_SCHEDULER_INSTANCE.registerTaskExecutor(taskType, executor);
}

export function resetCronSchedulerForTests(): void {
  CRON_SCHEDULER_INSTANCE.clear();
}

export type { CronScheduler, TaskExecutor };
