/**
 * Cron 定时任务调度器
 *
 * 基础的 cron 定时任务系统，支持：
 * - 标准 5 字段 cron 表达式
 * - 任务注册和取消
 * - 任务持久化
 * - 任务执行日志
 */

import { logger } from './logger.js';
import fs from 'fs';
import path from 'path';
import { AppPaths } from './config/appPaths.js';

/** Cron 任务定义 */
export interface CronJob {
  /** 任务唯一 ID */
  id: string;
  /** 任务名称 */
  name: string;
  /** Cron 表达式（5字段：分 时 日 月 周） */
  cron: string;
  /** 任务执行函数 */
  handler: () => Promise<void> | void;
  /** 是否启用 */
  enabled?: boolean;
  /** 任务描述 */
  description?: string;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 重试间隔（毫秒） */
  retryDelayMs?: number;
}

/** 持久化的任务配置 */
interface PersistedJob {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
  description?: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastError?: string;
}

/** 任务运行状态 */
interface JobRuntime {
  job: CronJob;
  timeoutId: NodeJS.Timeout | null;
  lastRunAt?: Date;
  nextRunAt?: Date;
  lastError?: string;
}

/**
 * 解析 cron 表达式，计算下次运行时间
 * 支持标准 5 字段格式：分 时 日 月 周
 */
function getNextRunTime(cron: string, from: Date = new Date()): Date {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`无效的 cron 表达式: ${cron}，需要 5 个字段`);
  }

  const [minuteExpr, hourExpr, dayOfMonthExpr, monthExpr, dayOfWeekExpr] = parts;

  const parseField = (expr: string, min: number, max: number): number[] => {
    if (expr === '*') {
      const result: number[] = [];
      for (let i = min; i <= max; i++) result.push(i);
      return result;
    }

    const values = new Set<number>();
    const parts = expr.split(',');

    for (const part of parts) {
      if (part.includes('/')) {
        const [range, step] = part.split('/');
        const stepVal = parseInt(step, 10);
        const [start, end] = range === '*' ? [min, max] : range.split('-').map(Number);
        for (let i = start; i <= end; i += stepVal) {
          values.add(i);
        }
      } else if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= end; i++) {
          values.add(i);
        }
      } else {
        values.add(parseInt(part, 10));
      }
    }

    return [...values].sort((a, b) => a - b);
  };

  const minutes = parseField(minuteExpr, 0, 59);
  const hours = parseField(hourExpr, 0, 23);
  const daysOfMonth = parseField(dayOfMonthExpr, 1, 31);
  const months = parseField(monthExpr, 1, 12);
  const daysOfWeek = parseField(dayOfWeekExpr, 0, 6);

  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  for (let i = 0; i < 365 * 24 * 60; i++) {
    const minute = next.getMinutes();
    const hour = next.getHours();
    const dayOfMonth = next.getDate();
    const month = next.getMonth() + 1;
    const dayOfWeek = next.getDay();

    if (
      minutes.includes(minute) &&
      hours.includes(hour) &&
      daysOfMonth.includes(dayOfMonth) &&
      months.includes(month) &&
      daysOfWeek.includes(dayOfWeek)
    ) {
      return next;
    }

    next.setMinutes(next.getMinutes() + 1);
  }

  throw new Error(`无法计算下次运行时间: ${cron}`);
}

/**
 * Cron 调度器
 */
class CronScheduler {
  private jobs: Map<string, JobRuntime> = new Map();
  private persistedJobs: Map<string, PersistedJob> = new Map();
  private initialized = false;
  private jobsFile: string;

  constructor() {
    this.jobsFile = path.join(AppPaths.userDataDir, 'cron-jobs.json');
  }

  /**
   * 初始化调度器
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    logger.info('[CronScheduler] 正在初始化定时任务调度器...');
    this.loadPersistedJobs();
    this.initialized = true;
    logger.info('[CronScheduler] 定时任务调度器初始化完成');
  }

  /**
   * 加载持久化任务配置
   */
  private loadPersistedJobs(): void {
    try {
      if (fs.existsSync(this.jobsFile)) {
        const data = JSON.parse(fs.readFileSync(this.jobsFile, 'utf-8'));
        if (Array.isArray(data)) {
          for (const job of data) {
            this.persistedJobs.set(job.id, job);
          }
        }
      }
    } catch (e) {
      logger.warn('[CronScheduler] 加载持久化任务失败:', e);
    }
  }

  /**
   * 保存持久化任务配置
   */
  private savePersistedJobs(): void {
    try {
      const dir = path.dirname(this.jobsFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = [...this.persistedJobs.values()];
      fs.writeFileSync(this.jobsFile, JSON.stringify(data, null, 2));
    } catch (e) {
      logger.warn('[CronScheduler] 保存持久化任务失败:', e);
    }
  }

  /**
   * 注册定时任务
   */
  registerJob(job: CronJob): void {
    if (this.jobs.has(job.id)) {
      logger.warn(`[CronScheduler] 任务已存在，更新: ${job.id}`);
      this.unregisterJob(job.id);
    }

    const enabled = job.enabled !== false;

    const runtime: JobRuntime = {
      job,
      timeoutId: null,
    };

    // 合并持久化配置
    const persisted = this.persistedJobs.get(job.id);
    if (persisted) {
      if (persisted.enabled !== undefined) {
        runtime.job = { ...job, enabled: persisted.enabled };
      }
    }

    this.jobs.set(job.id, runtime);

    if (enabled) {
      this.scheduleNextRun(job.id);
    }

    this.persistedJobs.set(job.id, {
      id: job.id,
      name: job.name,
      cron: job.cron,
      enabled: job.enabled !== false,
      description: job.description,
      ...persisted,
    });
    this.savePersistedJobs();

    logger.info(`[CronScheduler] 已注册任务: ${job.name} (${job.id}) cron=${job.cron}`);
  }

  /**
   * 调度任务下次运行
   */
  private scheduleNextRun(jobId: string): void {
    const runtime = this.jobs.get(jobId);
    if (!runtime) return;

    try {
      const nextRun = getNextRunTime(runtime.job.cron);
      runtime.nextRunAt = nextRun;

      const delay = nextRun.getTime() - Date.now();

      // 防止延迟溢出 32 位整数（setTimeout 限制）
      // 如果延迟超过 24 小时，则设置一个 12 小时的检查点
      const MAX_DELAY = 24 * 60 * 60 * 1000; // 24 小时
      const actualDelay = Math.min(delay, MAX_DELAY);

      if (runtime.timeoutId) {
        clearTimeout(runtime.timeoutId);
      }

      runtime.timeoutId = setTimeout(() => {
        // 如果延迟被截断了，重新调度（用于检查点机制）
        if (delay > MAX_DELAY) {
          this.scheduleNextRun(jobId);
        } else {
          this.runJob(jobId);
        }
      }, actualDelay);

      logger.debug(`[CronScheduler] 任务 ${jobId} 下次运行: ${nextRun.toLocaleString()}`);
    } catch (e) {
      logger.error(`[CronScheduler] 调度任务失败: ${jobId}`, e);
    }
  }

  /**
   * 执行任务
   */
  private async runJob(jobId: string): Promise<void> {
    const runtime = this.jobs.get(jobId);
    if (!runtime) return;

    const persisted = this.persistedJobs.get(jobId);
    const maxRetries = runtime.job.maxRetries || 0;
    const retryDelayMs = runtime.job.retryDelayMs || 5000;

    runtime.lastRunAt = new Date();
    if (persisted) {
      persisted.lastRunAt = runtime.lastRunAt.toISOString();
      this.savePersistedJobs();
    }

    logger.info(`[CronScheduler] 执行任务: ${runtime.job.name} (${jobId})`);

    let attempts = 0;
    while (attempts <= maxRetries) {
      try {
        await runtime.job.handler();
        logger.info(`[CronScheduler] 任务执行成功: ${runtime.job.name} (${jobId})`);
        if (persisted) {
          persisted.lastError = undefined;
          this.savePersistedJobs();
        }
        break;
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        runtime.lastError = errMsg;
        if (persisted) {
          persisted.lastError = errMsg;
          this.savePersistedJobs();
        }

        logger.error(`[CronScheduler] 任务执行失败: ${runtime.job.name} (${jobId}), 尝试 ${attempts + 1}/${maxRetries + 1}: ${errMsg}`);

        if (attempts < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
        attempts++;
      }
    }

    // 调度下次运行
    if (runtime.job.enabled !== false) {
      this.scheduleNextRun(jobId);
    }
  }

  /**
   * 取消注册任务
   */
  unregisterJob(jobId: string): void {
    const runtime = this.jobs.get(jobId);
    if (runtime) {
      if (runtime.timeoutId) {
        clearTimeout(runtime.timeoutId);
      }
      this.jobs.delete(jobId);
      logger.info(`[CronScheduler] 已取消注册任务: ${jobId}`);
    }
  }

  /**
   * 启用/禁用任务
   */
  setJobEnabled(jobId: string, enabled: boolean): boolean {
    const runtime = this.jobs.get(jobId);
    if (!runtime) return false;

    runtime.job = { ...runtime.job, enabled };

    const persisted = this.persistedJobs.get(jobId);
    if (persisted) {
      persisted.enabled = enabled;
      this.savePersistedJobs();
    }

    if (enabled) {
      this.scheduleNextRun(jobId);
    } else {
      if (runtime.timeoutId) {
        clearTimeout(runtime.timeoutId);
        runtime.timeoutId = null;
      }
    }

    logger.info(`[CronScheduler] 任务 ${jobId} 已${enabled ? '启用' : '禁用'}`);
    return true;
  }

  /**
   * 获取所有任务状态
   */
  getJobs(): Array<{
    id: string;
    name: string;
    cron: string;
    enabled: boolean;
    description?: string;
    lastRunAt?: string;
    nextRunAt?: string;
    lastError?: string;
  }> {
    return [...this.jobs.values()].map(runtime => ({
      id: runtime.job.id,
      name: runtime.job.name,
      cron: runtime.job.cron,
      enabled: runtime.job.enabled !== false,
      description: runtime.job.description,
      lastRunAt: runtime.lastRunAt?.toISOString(),
      nextRunAt: runtime.nextRunAt?.toISOString(),
      lastError: runtime.lastError,
    }));
  }

  /**
   * 手动触发任务
   */
  async triggerJob(jobId: string): Promise<void> {
    await this.runJob(jobId);
  }

  /**
   * 销毁调度器
   */
  destroy(): void {
    for (const [jobId, runtime] of this.jobs) {
      if (runtime.timeoutId) {
        clearTimeout(runtime.timeoutId);
      }
    }
    this.jobs.clear();
    this.initialized = false;
    logger.info('[CronScheduler] 调度器已销毁');
  }
}

/** 全局调度器实例 */
export const cronScheduler = new CronScheduler();
