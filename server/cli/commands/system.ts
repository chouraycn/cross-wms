/**
 * system 命令
 * 系统信息 (info/resources/platform)
 *
 * 参考 openclaw system-cli，显示系统与运行环境信息。
 */

import type { Command } from "commander";
import os from "os";
import { logger } from "../../logger.js";

export type SystemOptions = {
  json?: boolean;
};

interface SystemInfo {
  platform: string;
  arch: string;
  nodeVersion: string;
  hostname: string;
  uptime: number;
  cpus: number;
  totalMemoryMb: number;
  freeMemoryMb: number;
  loadAvg: number[];
}

function getSystemInfo(): SystemInfo {
  const mem = process.memoryUsage();
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    hostname: os.hostname(),
    uptime: Math.floor(process.uptime()),
    cpus: os.cpus().length,
    totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
    freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
    loadAvg: os.loadavg(),
  };
}

interface ResourceUsage {
  process: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    externalMb: number;
  };
  system: {
    freeMemoryMb: number;
    totalMemoryMb: number;
    loadAvg: number[];
  };
}

function getResourceUsage(): ResourceUsage {
  const mem = process.memoryUsage();
  return {
    process: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      externalMb: Math.round(mem.external / 1024 / 1024),
    },
    system: {
      freeMemoryMb: Math.round(os.freemem() / 1024 / 1024),
      totalMemoryMb: Math.round(os.totalmem() / 1024 / 1024),
      loadAvg: os.loadavg(),
    },
  };
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(" ") || `${seconds}s`;
}

export function registerSystemCommand(program: Command): void {
  const systemCmd = program
    .command("system")
    .description("系统信息 (info/resources/platform)");

  systemCmd
    .command("info")
    .description("显示系统信息")
    .option("--json", "JSON 输出格式")
    .action((options: SystemOptions) => {
      const info = getSystemInfo();
      if (options.json) {
        logger.info(formatJsonOutput(info));
      } else {
        logger.info("");
        logger.info("  系统信息:");
        logger.info(`    平台:     ${info.platform}`);
        logger.info(`    架构:     ${info.arch}`);
        logger.info(`    Node:     ${info.nodeVersion}`);
        logger.info(`    主机名:   ${info.hostname}`);
        logger.info(`    运行时间: ${formatUptime(info.uptime)}`);
        logger.info(`    CPU 核数: ${info.cpus}`);
        logger.info(`    总内存:   ${info.totalMemoryMb} MB`);
        logger.info(`    空闲内存: ${info.freeMemoryMb} MB`);
        logger.info(`    负载:     ${info.loadAvg.map((v) => v.toFixed(2)).join(", ")}`);
        logger.info("");
      }
    });

  systemCmd
    .command("resources")
    .description("显示资源使用情况")
    .option("--json", "JSON 输出格式")
    .action((options: SystemOptions) => {
      const usage = getResourceUsage();
      if (options.json) {
        logger.info(formatJsonOutput(usage));
      } else {
        logger.info("");
        logger.info("  进程资源:");
        logger.info(`    RSS:       ${usage.process.rssMb} MB`);
        logger.info(`    堆使用:    ${usage.process.heapUsedMb} MB / ${usage.process.heapTotalMb} MB`);
        logger.info(`    外部内存:  ${usage.process.externalMb} MB`);
        logger.info("");
        logger.info("  系统资源:");
        logger.info(`    空闲内存:  ${usage.system.freeMemoryMb} MB / ${usage.system.totalMemoryMb} MB`);
        logger.info(`    负载:      ${usage.system.loadAvg.map((v) => v.toFixed(2)).join(", ")}`);
        logger.info("");
      }
    });

  systemCmd
    .command("platform")
    .description("显示平台信息")
    .option("--json", "JSON 输出格式")
    .action((options: SystemOptions) => {
      const info = { platform: process.platform, arch: process.arch, nodeVersion: process.version };
      if (options.json) {
        logger.info(formatJsonOutput(info));
      } else {
        logger.info(`${info.platform}/${info.arch} (Node ${info.nodeVersion})`);
      }
    });

  // 默认 info
  systemCmd
    .option("--json", "JSON 输出格式")
    .action((options: SystemOptions) => {
      const info = getSystemInfo();
      if (options.json) {
        logger.info(formatJsonOutput(info));
      } else {
        logger.info(`${info.platform}/${info.arch} | Node ${info.nodeVersion} | ${info.cpus} CPU | ${info.freeMemoryMb}/${info.totalMemoryMb} MB`);
      }
    });
}
