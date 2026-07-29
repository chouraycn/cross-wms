/**
 * dashboard 命令
 * 仪表板 (summary/widgets/metrics)
 *
 * 提供系统仪表板概览。
 * 使用本地内存状态模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type DashboardOptions = {
  json?: boolean;
};

interface DashboardSummary {
  sessions: number;
  agents: number;
  tasks: { total: number; running: number; completed: number };
  memory: { entries: number; sizeMb: number };
  uptime: string;
}

function getDashboardSummary(): DashboardSummary {
  return {
    sessions: 3,
    agents: 4,
    tasks: { total: 12, running: 2, completed: 8 },
    memory: { entries: 156, sizeMb: 4.2 },
    uptime: "3d5h",
  };
}

interface Widget {
  id: string;
  title: string;
  type: "chart" | "counter" | "list" | "status";
  data: unknown;
}

function getWidgets(): Widget[] {
  return [
    { id: "w1", title: "活跃会话", type: "counter", data: { value: 3 } },
    { id: "w2", title: "任务状态", type: "chart", data: { running: 2, completed: 8, failed: 2 } },
    { id: "w3", title: "内存使用", type: "status", data: { usedMb: 4.2, limitMb: 100, percentage: 4.2 } },
    { id: "w4", title: "最近代理活动", type: "list", data: [{ agent: "wms-expert", action: "chat", ts: "2025-01-15T10:00:00Z" }] },
  ];
}

function getMetrics(): Record<string, number> {
  return {
    requestsPerMin: 42,
    avgResponseMs: 320,
    errorRate: 0.5,
    activeConnections: 8,
    queueDepth: 3,
  };
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerDashboardCommand(program: Command): void {
  const dashboardCmd = program
    .command("dashboard")
    .description("仪表板 (summary/widgets/metrics)");

  dashboardCmd
    .command("summary")
    .description("显示仪表板摘要")
    .option("--json", "JSON 输出格式")
    .action((options: DashboardOptions) => {
      const summary = getDashboardSummary();
      if (options.json) {
        logger.info(formatJsonOutput(summary));
      } else {
        logger.info("");
        logger.info("  仪表板摘要:");
        logger.info(`    会话:   ${summary.sessions}`);
        logger.info(`    代理:   ${summary.agents}`);
        logger.info(`    任务:   ${summary.tasks.total} (运行中 ${summary.tasks.running}, 已完成 ${summary.tasks.completed})`);
        logger.info(`    记忆:   ${summary.memory.entries} 条 (${summary.memory.sizeMb} MB)`);
        logger.info(`    运行:   ${summary.uptime}`);
        logger.info("");
      }
    });

  dashboardCmd
    .command("widgets")
    .description("列出仪表板组件")
    .option("--json", "JSON 输出格式")
    .action((options: DashboardOptions) => {
      const widgets = getWidgets();
      if (options.json) {
        logger.info(formatJsonOutput(widgets));
      } else {
        logger.info("仪表板组件:");
        for (const w of widgets) {
          logger.info(`  [${w.type}] ${w.title} (${w.id})`);
        }
      }
    });

  dashboardCmd
    .command("metrics")
    .description("显示关键指标")
    .option("--json", "JSON 输出格式")
    .action((options: DashboardOptions) => {
      const metrics = getMetrics();
      if (options.json) {
        logger.info(formatJsonOutput(metrics));
      } else {
        logger.info("关键指标:");
        for (const [key, value] of Object.entries(metrics)) {
          logger.info(`  ${key}: ${value}`);
        }
      }
    });

  // 默认 summary
  dashboardCmd
    .option("--json", "JSON 输出格式")
    .action((options: DashboardOptions) => {
      const summary = getDashboardSummary();
      if (options.json) {
        logger.info(formatJsonOutput(summary));
      } else {
        logger.info(`会话 ${summary.sessions} | 代理 ${summary.agents} | 任务 ${summary.tasks.running}/${summary.tasks.total} | 记忆 ${summary.memory.entries}`);
      }
    });
}
