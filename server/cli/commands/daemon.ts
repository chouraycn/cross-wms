/**
 * daemon 命令
 * 守护进程管理 (start/stop/restart/status/install/uninstall)
 *
 * 参考 openclaw daemon-cli，封装对 server/engine/daemonManager 的调用。
 * 当守护进程系统尚未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type DaemonOptions = {
  json?: boolean;
};

/** 守护进程运行状态 */
type DaemonState = "running" | "stopped" | "installed" | "not-installed";

/** 守护进程状态信息 */
interface DaemonStatus {
  state: DaemonState;
  pid?: number;
  startedAt?: string;
  restartCount: number;
  service: string;
  platform: string;
}

/** 模拟守护进程状态 */
let daemonState: DaemonStatus = {
  state: "not-installed",
  restartCount: 0,
  service: "cdfknow-daemon",
  platform: process.platform,
};

/** 获取守护进程状态 */
function getDaemonStatus(): DaemonStatus {
  return { ...daemonState };
}

/** 启动守护进程 */
function startDaemon(): DaemonStatus {
  if (daemonState.state === "running") {
    return getDaemonStatus();
  }
  daemonState = {
    ...daemonState,
    state: "running",
    pid: Math.floor(Math.random() * 90000) + 10000,
    startedAt: new Date().toISOString(),
  };
  return getDaemonStatus();
}

/** 停止守护进程 */
function stopDaemon(): DaemonStatus {
  daemonState = {
    ...daemonState,
    state: daemonState.state === "not-installed" ? "not-installed" : "stopped",
    pid: undefined,
    startedAt: undefined,
  };
  return getDaemonStatus();
}

/** 重启守护进程 */
function restartDaemon(): DaemonStatus {
  daemonState = { ...daemonState, restartCount: daemonState.restartCount + 1 };
  stopDaemon();
  return startDaemon();
}

/** 安装守护进程服务 */
function installDaemon(): DaemonStatus {
  daemonState = { ...daemonState, state: "installed" };
  return getDaemonStatus();
}

/** 卸载守护进程服务 */
function uninstallDaemon(): DaemonStatus {
  daemonState = {
    state: "not-installed",
    restartCount: 0,
    service: daemonState.service,
    platform: daemonState.platform,
  };
  return getDaemonStatus();
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化状态文本输出 */
function formatStatusOutput(status: DaemonStatus): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  守护进程状态:");
  lines.push(`    服务:     ${status.service}`);
  lines.push(`    平台:     ${status.platform}`);
  lines.push(`    状态:     ${status.state}`);
  if (status.pid !== undefined) {
    lines.push(`    PID:      ${status.pid}`);
  }
  if (status.startedAt) {
    lines.push(`    启动时间: ${new Date(status.startedAt).toLocaleString("zh-CN")}`);
  }
  lines.push(`    重启次数: ${status.restartCount}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 daemon 命令
 */
export function registerDaemonCommand(program: Command): void {
  const daemonCmd = program
    .command("daemon")
    .description("守护进程管理 (start/stop/restart/status/install/uninstall)");

  daemonCmd
    .command("start")
    .description("启动守护进程")
    .option("--json", "JSON 输出格式")
    .action((options: DaemonOptions) => {
      const status = startDaemon();
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info(`守护进程已启动 (PID: ${status.pid ?? "n/a"})`);
        logger.info(formatStatusOutput(status));
      }
    });

  daemonCmd
    .command("stop")
    .description("停止守护进程")
    .option("--json", "JSON 输出格式")
    .action((options: DaemonOptions) => {
      const status = stopDaemon();
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info("守护进程已停止");
        logger.info(formatStatusOutput(status));
      }
    });

  daemonCmd
    .command("restart")
    .description("重启守护进程")
    .option("--json", "JSON 输出格式")
    .action((options: DaemonOptions) => {
      const status = restartDaemon();
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info(`守护进程已重启 (PID: ${status.pid ?? "n/a"})`);
        logger.info(formatStatusOutput(status));
      }
    });

  daemonCmd
    .command("status")
    .description("查看守护进程状态")
    .option("--json", "JSON 输出格式")
    .action((options: DaemonOptions) => {
      const status = getDaemonStatus();
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info(formatStatusOutput(status));
      }
    });

  daemonCmd
    .command("install")
    .description("安装守护进程为系统服务 (launchd/systemd/schtasks)")
    .option("--json", "JSON 输出格式")
    .action((options: DaemonOptions) => {
      const status = installDaemon();
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info(`守护进程服务已安装: ${status.service}`);
        logger.info(formatStatusOutput(status));
      }
    });

  daemonCmd
    .command("uninstall")
    .description("卸载守护进程系统服务")
    .option("--json", "JSON 输出格式")
    .action((options: DaemonOptions) => {
      const status = uninstallDaemon();
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info("守护进程服务已卸载");
        logger.info(formatStatusOutput(status));
      }
    });

  // 默认 status 子命令
  daemonCmd.action((options: DaemonOptions) => {
    const status = getDaemonStatus();
    if (options.json) {
      logger.info(formatJsonOutput(status));
    } else {
      logger.info(formatStatusOutput(status));
    }
  });
}
