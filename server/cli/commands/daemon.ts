import type { Command } from 'commander';
import { logger } from '../../logger.js';
import {
  getDaemonManager,
  startDaemon,
  stopDaemon,
  restartDaemon,
  type DaemonType,
  type DaemonProcess,
} from '../../engine/daemonManager.js';

export type DaemonOptions = {
  json?: boolean;
  type?: DaemonType;
  autoRestart?: boolean;
  maxRestarts?: number;
};

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatDaemonList(daemons: DaemonProcess[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  守护进程列表 (共 ${daemons.length} 个):`);
  lines.push('');
  for (const daemon of daemons) {
    const statusIcon = daemon.status === 'running' ? '✓' : daemon.status === 'error' ? '✗' : '○';
    const uptime = daemon.startedAt ? `${Math.floor((Date.now() - daemon.startedAt) / 1000)}s` : '0s';
    lines.push(`    ${statusIcon} ${daemon.id.padEnd(20)} [${daemon.type.padEnd(10)}] ${daemon.status.padEnd(10)} PID: ${(daemon.pid ?? '-').toString().padEnd(6)} ${daemon.name} (${uptime})`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatDaemonStatus(daemon: DaemonProcess): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`  守护进程: ${daemon.id}`);
  lines.push(`    名称:         ${daemon.name}`);
  lines.push(`    类型:         ${daemon.type}`);
  lines.push(`    状态:         ${daemon.status}`);
  if (daemon.pid !== undefined) {
    lines.push(`    PID:          ${daemon.pid}`);
  }
  if (daemon.startedAt) {
    lines.push(`    启动时间:     ${new Date(daemon.startedAt).toLocaleString('zh-CN')}`);
  }
  lines.push(`    运行时长:     ${daemon.uptimeMs > 0 ? `${Math.floor(daemon.uptimeMs / 1000)}s` : '0s'}`);
  lines.push(`    重启次数:     ${daemon.restartCount}/${daemon.maxRestarts}`);
  lines.push(`    自动重启:     ${daemon.autoRestart ? '是' : '否'}`);
  lines.push(`    命令:         ${daemon.command} ${daemon.args.join(' ')}`);
  if (daemon.errorMessage) {
    lines.push(`    错误:         ${daemon.errorMessage}`);
  }
  lines.push('');
  return lines.join('\n');
}

function formatDaemonStats(stats: ReturnType<ReturnType<typeof getDaemonManager>['getStats']>): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('  守护进程统计:');
  lines.push(`    总数:         ${stats.total}`);
  lines.push(`    运行中:       ${stats.running}`);
  lines.push(`    已停止:       ${stats.stopped}`);
  lines.push(`    错误:         ${stats.error}`);
  lines.push(`    启动中:       ${stats.starting}`);
  lines.push(`    停止中:       ${stats.stopping}`);
  lines.push(`    重启中:       ${stats.restarting}`);
  lines.push(`    总重启次数:   ${stats.totalRestarts}`);
  lines.push('');
  lines.push('  按类型统计:');
  for (const [type, count] of Object.entries(stats.byType)) {
    lines.push(`    ${type.padEnd(12)}: ${count}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function registerDaemonCommand(program: Command): void {
  const daemonCmd = program
    .command('daemon')
    .description('守护进程管理 (start/stop/restart/status/list/stats/logs)');

  daemonCmd
    .command('start <name>')
    .description('启动守护进程')
    .option('--type <type>', '进程类型', 'server')
    .option('--command <cmd>', '启动命令')
    .option('--args <args>', '命令参数(逗号分隔)')
    .option('--auto-restart', '自动重启', true)
    .option('--max-restarts <n>', '最大重启次数', '5')
    .option('--json', 'JSON 输出格式')
    .action(async (name: string, options: DaemonOptions & { command?: string; args?: string }) => {
      const manager = getDaemonManager();
      const daemonType = options.type as DaemonType;
      const cmd = options.command || process.argv[0];
      const args = options.args ? options.args.split(',') : [];

      try {
        const daemon = await manager.start(name, daemonType, {
          command: cmd,
          args,
          autoRestart: options.autoRestart,
          maxRestarts: parseInt(options.maxRestarts, 10),
        });
        if (options.json) {
          logger.info(formatJsonOutput(daemon));
        } else {
          logger.info(`守护进程已启动 (ID: ${daemon.id}, PID: ${daemon.pid})`);
          logger.info(formatDaemonStatus(daemon));
        }
      } catch (error) {
        if (options.json) {
          logger.info(formatJsonOutput({ error: error instanceof Error ? error.message : String(error) }));
        } else {
          logger.error(`守护进程启动失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    });

  daemonCmd
    .command('stop <id>')
    .description('停止守护进程')
    .option('--reason <reason>', '停止原因')
    .option('--json', 'JSON 输出格式')
    .action(async (id: string, options: DaemonOptions & { reason?: string }) => {
      const result = await stopDaemon(id, options.reason);
      if (options.json) {
        logger.info(formatJsonOutput({ id, success: result }));
      } else {
        logger.info(result ? `守护进程 ${id} 已停止` : `守护进程 ${id} 不存在`);
      }
    });

  daemonCmd
    .command('restart <id>')
    .description('重启守护进程')
    .option('--json', 'JSON 输出格式')
    .action(async (id: string, options: DaemonOptions) => {
      const daemon = await restartDaemon(id);
      if (options.json) {
        logger.info(formatJsonOutput(daemon || { id, error: 'not found' }));
      } else {
        if (daemon) {
          logger.info(`守护进程已重启 (ID: ${daemon.id}, PID: ${daemon.pid})`);
        } else {
          logger.error(`守护进程 ${id} 不存在`);
        }
      }
    });

  daemonCmd
    .command('status <id>')
    .description('查看守护进程状态')
    .option('--json', 'JSON 输出格式')
    .action((id: string, options: DaemonOptions) => {
      const manager = getDaemonManager();
      const daemon = manager.getDaemon(id);
      if (options.json) {
        logger.info(formatJsonOutput(daemon || { id, error: 'not found' }));
      } else {
        if (daemon) {
          logger.info(formatDaemonStatus(daemon));
        } else {
          logger.error(`守护进程 ${id} 不存在`);
        }
      }
    });

  daemonCmd
    .command('list')
    .description('列出所有守护进程')
    .option('--type <type>', '按类型筛选')
    .option('--status <status>', '按状态筛选')
    .option('--json', 'JSON 输出格式')
    .action((options: DaemonOptions & { status?: string }) => {
      const manager = getDaemonManager();
      const daemons = manager.listDaemons({
        type: options.type as DaemonType,
        status: options.status as DaemonProcess['status'],
      });
      if (options.json) {
        logger.info(formatJsonOutput(daemons));
      } else {
        logger.info(formatDaemonList(daemons));
      }
    });

  daemonCmd
    .command('stats')
    .description('查看守护进程统计信息')
    .option('--json', 'JSON 输出格式')
    .action((options: DaemonOptions) => {
      const manager = getDaemonManager();
      const stats = manager.getStats();
      if (options.json) {
        logger.info(formatJsonOutput(stats));
      } else {
        logger.info(formatDaemonStats(stats));
      }
    });

  daemonCmd
    .command('logs <id>')
    .description('查看守护进程日志')
    .option('--limit <n>', '日志条数', '20')
    .option('--json', 'JSON 输出格式')
    .action((id: string, options: DaemonOptions & { limit?: string }) => {
      const manager = getDaemonManager();
      const logs = manager.getLogs(id, parseInt(options.limit || '20', 10));
      if (options.json) {
        logger.info(formatJsonOutput(logs));
      } else {
        if (logs.length === 0) {
          logger.info(`守护进程 ${id} 没有日志`);
        } else {
          logger.info(`\n  守护进程 ${id} 的日志 (最近 ${logs.length} 条):\n`);
          for (const log of logs) {
            const timestamp = new Date(log.timestamp).toLocaleTimeString('zh-CN');
            const level = log.level.padEnd(5);
            logger.info(`    [${timestamp}] [${level}] ${log.message}`);
          }
          logger.info('');
        }
      }
    });

  daemonCmd
    .command('health-check')
    .description('管理健康检查')
    .option('--start', '启动健康检查')
    .option('--stop', '停止健康检查')
    .option('--json', 'JSON 输出格式')
    .action((options: DaemonOptions & { start?: boolean; stop?: boolean }) => {
      const manager = getDaemonManager();
      if (options.start) {
        manager.startHealthCheck();
        logger.info(options.json ? formatJsonOutput({ status: 'started' }) : '健康检查已启动');
      } else if (options.stop) {
        manager.stopHealthCheck();
        logger.info(options.json ? formatJsonOutput({ status: 'stopped' }) : '健康检查已停止');
      } else {
        logger.info('使用 --start 或 --stop 参数');
      }
    });

  daemonCmd.action((options: DaemonOptions) => {
    const manager = getDaemonManager();
    const daemons = manager.listDaemons();
    if (options.json) {
      logger.info(formatJsonOutput(daemons));
    } else {
      logger.info(formatDaemonList(daemons));
    }
  });
}
