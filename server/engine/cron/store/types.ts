/**
 * Cron Store Types - 存储层类型定义
 *
 * 定义 cron 存储相关的类型：隔离任务、配置任务运行时条目、加载结果等。
 */

import type { CronStoreFile } from "../types.js";

/** 无效的配置 cron 任务，被隔离而不是加载到运行时 */
export type QuarantinedCronConfigJob = {
  sourceIndex: number;
  reason: string;
  job?: Record<string, unknown>;
  raw?: unknown;
  state?: Record<string, unknown>;
  updatedAtMs?: number;
  scheduleIdentity?: string;
};

/** 隔离文件格式，记录在 cron 存储加载期间跳过的配置任务 */
export type CronQuarantineFile = {
  version: 1;
  jobs: Array<QuarantinedCronConfigJob & { quarantinedAtMs: number }>;
};

/** 配置源任务的运行时状态，这些任务不作为规范任务持久化 */
export type CronConfigJobRuntimeEntry = {
  updatedAtMs?: number;
  scheduleIdentity?: string;
  state?: Record<string, unknown>;
};

/** 组合的 cron 存储加载结果，包含规范任务和配置支持的元数据 */
export type LoadedCronStore = {
  store: CronStoreFile;
  configJobs: Array<Record<string, unknown>>;
  configJobIndexes: number[];
  configJobRuntimeEntries: CronConfigJobRuntimeEntry[];
  invalidConfigRows: QuarantinedCronConfigJob[];
};
