import { Command } from 'commander';
import { promises as fs } from 'fs';
import path from 'path';

/** 守护进程 PID 文件路径 */
function getPidFile(): string {
  return path.join(process.cwd(), 'daemon.pid');
}

/** 守护进程日志路径 */
function getLogFile(): string {
  return path.join(process.cwd(), 'logs', 'daemon.log');
}

/** 读取 PID */
async function readPid(): Promise<number | null> {
  try {
    const content = await fs.readFile(getPidFile(), 'utf-8');
    const pid = Number.parseInt(content.trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

/** 写入 PID */
async function writePid(pid: number): Promise<void> {
  await fs.writeFile(getPidFile(), String(pid), 'utf-8');
}

/** 删除 PID 文件 */
async function removePid(): Promise<void> {
  try {
    await fs.unlink(getPidFile());
  } catch {
    // 忽略
  }
}

/** 检查进程是否存在（模拟实现） */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export const daemonCommand = new Command('daemon')
  .description('管理守护进程')
  .version('1.0.0');

// start 子命令
daemonCommand
  .command('start')
  .description('启动守护进程')
  .action(async () => {
    const existingPid = await readPid();
    if (existingPid && isProcessRunning(existingPid)) {
      console.log(`守护进程已在运行 (PID: ${existingPid})`);
      return;
    }

    // 模拟启动守护进程
    const pid = process.pid + 1000;
    await writePid(pid);
    console.log(`守护进程已启动 (PID: ${pid})`);
    console.log('日志文件:', getLogFile());
  });

// stop 子命令
daemonCommand
  .command('stop')
  .description('停止守护进程')
  .action(async () => {
    const pid = await readPid();
    if (!pid) {
      console.log('守护进程未运行');
      return;
    }

    if (!isProcessRunning(pid)) {
      await removePid();
      console.log('守护进程已停止 (PID 文件已清理)');
      return;
    }

    try {
      process.kill(pid, 'SIGTERM');
      console.log(`守护进程已停止 (PID: ${pid})`);
    } catch (error) {
      console.log(`停止守护进程失败: ${(error as Error).message}`);
    }
    await removePid();
  });

// status 子命令
daemonCommand
  .command('status')
  .description('查看守护进程状态')
  .action(async () => {
    const pid = await readPid();
    if (!pid) {
      console.log('守护进程状态: 未运行');
      return;
    }

    const running = isProcessRunning(pid);
    console.log(`守护进程状态: ${running ? '运行中' : '已停止'}`);
    console.log(`PID: ${pid}`);
    console.log(`日志文件: ${getLogFile()}`);

    if (running) {
      console.log(`运行时间: 模拟运行中`);
      console.log(`内存使用: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`);
    }
  });

// logs 子命令
daemonCommand
  .command('logs')
  .description('查看守护进程日志')
  .option('-n <lines>', '显示最后 N 行', '50')
  .action(async (options: { n?: string }) => {
    const logFile = getLogFile();
    try {
      const content = await fs.readFile(logFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      const n = Number.parseInt(options.n ?? '50', 10);
      console.log(`守护进程日志 (最后 ${Math.min(n, lines.length)} 行):`);
      console.log('');
      for (const line of lines.slice(-n)) {
        console.log(`  ${line}`);
      }
    } catch {
      console.log('暂无守护进程日志');
    }
  });
