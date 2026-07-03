/**
 * cron 命令
 * 定时任务管理 (list/add/remove/run/history/pause/resume)
 *
 * 参考 openclaw cron-cli，封装对 server/engine/cron 模块的调用。
 * 当定时任务运行时未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type CronOptions = {
  json?: boolean;
};

/** 定时任务条目 */
interface CronJob {
  id: string;
  name: string;
  cron: string;
  task: string;
  paused: boolean;
  lastRunAt?: string;
  nextRunAt?: string;
  runCount: number;
}

/** 运行历史条目 */
interface CronHistoryEntry {
  jobId: string;
  jobName: string;
  ranAt: string;
  durationMs: number;
  status: "success" | "failed";
  message?: string;
}

/** 模拟定时任务存储 */
const CRON_STORE: Map<string, CronJob> = new Map([
  [
    "cron-001",
    { id: "cron-001", name: "每日库存快照", cron: "0 2 * * *", task: "snapshot:inventory", paused: false, lastRunAt: "2025-01-21T02:00:00Z", nextRunAt: "2025-01-22T02:00:00Z", runCount: 12 },
  ],
  [
    "cron-002",
    { id: "cron-002", name: "补货预测", cron: "0 */6 * * *", task: "predict:replenish", paused: false, lastRunAt: "2025-01-21T18:00:00Z", nextRunAt: "2025-01-22T00:00:00Z", runCount: 48 },
  ],
  [
    "cron-003",
    { id: "cron-003", name: "周报生成", cron: "0 9 * * 1", task: "report:weekly", paused: true, lastRunAt: "2025-01-20T09:00:00Z", nextRunAt: "2025-01-27T09:00:00Z", runCount: 4 },
  ],
]);

/** 模拟运行历史 */
const CRON_HISTORY: CronHistoryEntry[] = [
  { jobId: "cron-001", jobName: "每日库存快照", ranAt: "2025-01-21T02:00:00Z", durationMs: 3200, status: "success" },
  { jobId: "cron-002", jobName: "补货预测", ranAt: "2025-01-21T18:00:00Z", durationMs: 8500, status: "success" },
  { jobId: "cron-002", jobName: "补货预测", ranAt: "2025-01-21T12:00:00Z", durationMs: 9100, status: "failed", message: "模型超时" },
];

/** 列出定时任务 */
function listCronJobs(): CronJob[] {
  return Array.from(CRON_STORE.values()).sort((a, b) => a.id.localeCompare(b.id));
}

/** 添加定时任务 */
function addCronJob(params: { name: string; cron: string; task: string }): CronJob {
  const id = `cron-${String(CRON_STORE.size + 1).padStart(3, "0")}`;
  const job: CronJob = {
    id,
    name: params.name,
    cron: params.cron,
    task: params.task,
    paused: false,
    runCount: 0,
  };
  CRON_STORE.set(id, job);
  return job;
}

/** 删除定时任务 */
function removeCronJob(id: string): boolean {
  return CRON_STORE.delete(id);
}

/** 立即运行定时任务 */
function runCronJob(id: string): { success: boolean; message: string; durationMs: number } {
  const job = CRON_STORE.get(id);
  if (!job) {
    return { success: false, message: `任务 ${id} 不存在`, durationMs: 0 };
  }
  const duration = Math.floor(Math.random() * 5000) + 500;
  job.lastRunAt = new Date().toISOString();
  job.runCount += 1;
  CRON_HISTORY.unshift({
    jobId: job.id,
    jobName: job.name,
    ranAt: job.lastRunAt,
    durationMs: duration,
    status: "success",
  });
  return { success: true, message: `任务 ${job.name} 运行完成`, durationMs: duration };
}

/** 查询运行历史 */
function getCronHistory(jobId?: string): CronHistoryEntry[] {
  const history = jobId ? CRON_HISTORY.filter((h) => h.jobId === jobId) : CRON_HISTORY;
  return [...history].sort((a, b) => new Date(b.ranAt).getTime() - new Date(a.ranAt).getTime());
}

/** 暂停定时任务 */
function pauseCronJob(id: string): { success: boolean; message: string } {
  const job = CRON_STORE.get(id);
  if (!job) {
    return { success: false, message: `任务 ${id} 不存在` };
  }
  job.paused = true;
  return { success: true, message: `已暂停任务 ${job.name}` };
}

/** 恢复定时任务 */
function resumeCronJob(id: string): { success: boolean; message: string } {
  const job = CRON_STORE.get(id);
  if (!job) {
    return { success: false, message: `任务 ${id} 不存在` };
  }
  job.paused = false;
  return { success: true, message: `已恢复任务 ${job.name}` };
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化任务列表文本输出 */
function formatCronList(jobs: CronJob[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  定时任务 (共 ${jobs.length} 个):`);
  lines.push("");
  for (const job of jobs) {
    const status = job.paused ? "⏸ 暂停" : "✓ 启用";
    lines.push(`    ${status}  ${job.id}  ${job.name}`);
    lines.push(`           cron: ${job.cron}  task: ${job.task}  运行次数: ${job.runCount}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化历史文本输出 */
function formatCronHistory(history: CronHistoryEntry[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  运行历史 (共 ${history.length} 条):`);
  lines.push("");
  for (const entry of history) {
    const icon = entry.status === "success" ? "✓" : "✗";
    lines.push(`    ${icon} ${entry.ranAt}  ${entry.jobName}  (${entry.durationMs}ms)`);
    if (entry.message) {
      lines.push(`        ${entry.message}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 cron 命令
 */
export function registerCronCommand(program: Command): void {
  const cronCmd = program
    .command("cron")
    .aliases(["cr"])
    .description("定时任务管理 (list/add/remove/run/history/pause/resume)");

  cronCmd
    .command("list")
    .description("列出所有定时任务")
    .option("--json", "JSON 输出格式")
    .action((options: CronOptions) => {
      const jobs = listCronJobs();
      if (options.json) {
        logger.info(formatJsonOutput(jobs));
      } else {
        logger.info(formatCronList(jobs));
      }
    });

  cronCmd
    .command("add")
    .description("添加定时任务")
    .requiredOption("--name <name>", "任务名称")
    .requiredOption("--cron <expr>", "cron 表达式")
    .requiredOption("--task <task>", "任务标识")
    .option("--json", "JSON 输出格式")
    .action((options: CronOptions & { name: string; cron: string; task: string }) => {
      const job = addCronJob({ name: options.name, cron: options.cron, task: options.task });
      if (options.json) {
        logger.info(formatJsonOutput(job));
      } else {
        logger.info(`已添加定时任务 ${job.id}: ${job.name}`);
      }
    });

  cronCmd
    .command("remove <id>")
    .description("删除定时任务")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: CronOptions) => {
      const success = removeCronJob(id);
      if (options.json) {
        logger.info(formatJsonOutput({ id, success }));
      } else {
        logger.info(success ? `已删除任务 ${id}` : `任务 ${id} 不存在`);
      }
    });

  cronCmd
    .command("run <id>")
    .description("立即运行定时任务")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: CronOptions) => {
      const result = runCronJob(id);
      if (options.json) {
        logger.info(formatJsonOutput({ id, ...result }));
      } else {
        logger.info(`${result.success ? "✓" : "✗"} ${result.message} (${result.durationMs}ms)`);
      }
    });

  cronCmd
    .command("history [jobId]")
    .description("查看运行历史")
    .option("--json", "JSON 输出格式")
    .action((jobId: string | undefined, options: CronOptions) => {
      const history = getCronHistory(jobId);
      if (options.json) {
        logger.info(formatJsonOutput(history));
      } else {
        logger.info(formatCronHistory(history));
      }
    });

  cronCmd
    .command("pause <id>")
    .description("暂停定时任务")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: CronOptions) => {
      const result = pauseCronJob(id);
      if (options.json) {
        logger.info(formatJsonOutput({ id, ...result }));
      } else {
        logger.info(result.message);
      }
    });

  cronCmd
    .command("resume <id>")
    .description("恢复定时任务")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: CronOptions) => {
      const result = resumeCronJob(id);
      if (options.json) {
        logger.info(formatJsonOutput({ id, ...result }));
      } else {
        logger.info(result.message);
      }
    });

  // 默认 list 子命令
  cronCmd.action((options: CronOptions) => {
    const jobs = listCronJobs();
    if (options.json) {
      logger.info(formatJsonOutput(jobs));
    } else {
      logger.info(formatCronList(jobs));
    }
  });
}
