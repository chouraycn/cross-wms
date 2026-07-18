import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';

/** 从持久化文件读取任务 */
async function readPersistedJobs(): Promise<
  Array<{
    id: string;
    name: string;
    cron: string;
    enabled: boolean;
    description?: string;
    lastRunAt?: string;
    nextRunAt?: string;
    lastError?: string;
  }>
> {
  const jobsFile = path.join(process.cwd(), 'logs', 'cron-jobs.json');
  try {
    const content = await fs.readFile(jobsFile, 'utf-8');
    const data = JSON.parse(content) as Array<{
      id: string;
      name: string;
      cron: string;
      enabled: boolean;
      description?: string;
      lastRunAt?: string;
      nextRunAt?: string;
      lastError?: string;
    }>;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** 获取任务列表（优先读取持久化，否则模拟） */
async function getJobs() {
  const persisted = await readPersistedJobs();
  if (persisted.length > 0) return persisted;

  return [
    {
      id: 'cleanup-logs',
      name: '清理日志',
      cron: '0 2 * * *',
      enabled: true,
      description: '每天凌晨 2 点清理过期日志',
      lastRunAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'sync-models',
      name: '同步模型列表',
      cron: '0 */6 * * *',
      enabled: true,
      description: '每 6 小时同步一次模型列表',
      lastRunAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
      nextRunAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'health-check',
      name: '健康检查',
      cron: '*/5 * * * *',
      enabled: false,
      description: '每 5 分钟执行健康检查',
    },
  ];
}

/** 手动触发任务（模拟） */
async function triggerJob(jobId: string): Promise<void> {
  console.log(`[模拟] 任务 ${jobId} 已手动触发`);
}

/** 读取 cron 日志文件 */
async function readCronLogs(jobId?: string): Promise<string[]> {
  const logDir = path.join(process.cwd(), 'logs');
  const logFile = path.join(logDir, 'cron.log');
  try {
    const content = await fs.readFile(logFile, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    if (jobId) {
      return lines.filter((line) => line.includes(`[${jobId}]`));
    }
    return lines;
  } catch {
    return [`[模拟日志] ${jobId ?? 'all'} 暂无日志记录`];
  }
}

export const cronCommand = new Command('cron')
  .description('管理定时任务')
  .version('1.0.0');

// list 子命令
cronCommand
  .command('list')
  .description('列出所有定时任务')
  .action(async () => {
    const jobs = await getJobs();

    console.log('定时任务列表:');
    console.log('');
    for (const job of jobs) {
      const status = job.enabled ? '✓ 启用' : '✗ 禁用';
      console.log(`  ${job.id}: ${job.name}`);
      console.log(`    表达式: ${job.cron}`);
      console.log(`    状态: ${status}`);
      if (job.description) {
        console.log(`    描述: ${job.description}`);
      }
      if (job.lastRunAt) {
        console.log(`    上次运行: ${job.lastRunAt}`);
      }
      if (job.nextRunAt) {
        console.log(`    下次运行: ${job.nextRunAt}`);
      }
      if (job.lastError) {
        console.log(`    错误: ${job.lastError}`);
      }
      console.log('');
    }
    console.log(`共 ${jobs.length} 个任务`);
  });

// run 子命令
cronCommand
  .command('run <id>')
  .description('手动触发一个 cron 任务')
  .action(async (id: string) => {
    await triggerJob(id);
  });

// logs 子命令
cronCommand
  .command('logs <id>')
  .description('查看 cron 任务日志')
  .action(async (id: string) => {
    const logs = await readCronLogs(id);
    console.log(`任务 ${id} 的日志:`);
    console.log('');
    for (const line of logs.slice(-20)) {
      console.log(`  ${line}`);
    }
  });
