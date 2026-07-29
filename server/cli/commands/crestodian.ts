/**
 * crestodian 命令
 * 守护进程管理 (start/stop/status/restart)
 *
 * 参考 openclaw crestodian-cli，管理后台守护进程。
 * 使用本地内存状态模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type CrestodianOptions = {
  json?: boolean;
};

type DaemonState = "running" | "stopped" | "error";

interface DaemonStatus {
  name: string;
  state: DaemonState;
  pid?: number;
  startedAt?: string;
  restartCount: number;
}

const DAEMON_STATE: Map<string, DaemonStatus> = new Map([
  ["gateway", { name: "gateway", state: "running", pid: 12345, startedAt: "2025-01-15T08:00:00Z", restartCount: 0 }],
  ["cron", { name: "cron", state: "running", pid: 12346, startedAt: "2025-01-15T08:00:05Z", restartCount: 1 }],
  ["watcher", { name: "watcher", state: "stopped", restartCount: 0 }],
]);

function startDaemon(name: string): DaemonStatus {
  let daemon = DAEMON_STATE.get(name);
  if (!daemon) {
    daemon = { name, state: "stopped", restartCount: 0 };
    DAEMON_STATE.set(name, daemon);
  }
  daemon.state = "running";
  daemon.pid = Math.floor(Math.random() * 100000) + 1000;
  daemon.startedAt = new Date().toISOString();
  return daemon;
}

function stopDaemon(name: string): DaemonStatus | undefined {
  const daemon = DAEMON_STATE.get(name);
  if (!daemon) {
    return undefined;
  }
  daemon.state = "stopped";
  daemon.pid = undefined;
  return daemon;
}

function restartDaemon(name: string): DaemonStatus | undefined {
  const daemon = DAEMON_STATE.get(name);
  if (!daemon) {
    return undefined;
  }
  daemon.restartCount++;
  daemon.state = "running";
  daemon.pid = Math.floor(Math.random() * 100000) + 1000;
  daemon.startedAt = new Date().toISOString();
  return daemon;
}

function listDaemons(): DaemonStatus[] {
  return Array.from(DAEMON_STATE.values());
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerCrestodianCommand(program: Command): void {
  const crestodianCmd = program
    .command("crestodian")
    .description("守护进程管理 (start/stop/status/restart)");

  crestodianCmd
    .command("start <name>")
    .description("启动守护进程")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: CrestodianOptions) => {
      const daemon = startDaemon(name);
      logger.info(`已启动守护进程: ${name} (PID: ${daemon.pid})`);
      if (options.json) {
        logger.info(formatJsonOutput(daemon));
      }
    });

  crestodianCmd
    .command("stop <name>")
    .description("停止守护进程")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: CrestodianOptions) => {
      const daemon = stopDaemon(name);
      if (!daemon) {
        logger.error(`未找到守护进程: ${name}`);
        return;
      }
      logger.info(`已停止守护进程: ${name}`);
      if (options.json) {
        logger.info(formatJsonOutput(daemon));
      }
    });

  crestodianCmd
    .command("restart <name>")
    .description("重启守护进程")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: CrestodianOptions) => {
      const daemon = restartDaemon(name);
      if (!daemon) {
        logger.error(`未找到守护进程: ${name}`);
        return;
      }
      logger.info(`已重启守护进程: ${name} (PID: ${daemon.pid}, 重启次数: ${daemon.restartCount})`);
      if (options.json) {
        logger.info(formatJsonOutput(daemon));
      }
    });

  crestodianCmd
    .command("status")
    .description("查看所有守护进程状态")
    .option("--json", "JSON 输出格式")
    .action((options: CrestodianOptions) => {
      const daemons = listDaemons();
      if (options.json) {
        logger.info(formatJsonOutput(daemons));
      } else {
        logger.info("守护进程状态:");
        for (const d of daemons) {
          const icon = d.state === "running" ? "✓" : d.state === "error" ? "✗" : "○";
          logger.info(`  ${icon} ${d.name} [${d.state}]${d.pid ? ` PID: ${d.pid}` : ""} (重启: ${d.restartCount})`);
        }
      }
    });

  // 默认 status
  crestodianCmd
    .option("--json", "JSON 输出格式")
    .action((options: CrestodianOptions) => {
      const daemons = listDaemons();
      if (options.json) {
        logger.info(formatJsonOutput(daemons));
      } else {
        logger.info("守护进程状态:");
        for (const d of daemons) {
          const icon = d.state === "running" ? "✓" : "○";
          logger.info(`  ${icon} ${d.name} [${d.state}]`);
        }
      }
    });
}
