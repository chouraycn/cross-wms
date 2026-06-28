/**
 * status 命令
 * 显示 Gateway 状态、通道、会话数等信息
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type StatusOptions = {
  json?: boolean;
};

/** 获取 Gateway 状态 */
interface GatewayStatus {
  uptime: string;
  memoryUsage: { used: number; total: number };
  activeSessions: number;
  activeCronJobs: number;
  activeAgents: number;
  enabledPlugins: number;
  onlineNodes: number;
  channels: ChannelStatus[];
}

interface ChannelStatus {
  name: string;
  status: "online" | "offline" | "error";
  lastHeartbeat: string;
}

/** 获取模拟的 Gateway 状态 */
function getGatewayStatus(): GatewayStatus {
  // 实际实现应从 Gateway 服务获取
  return {
    uptime: "1天 2小时 30分钟",
    memoryUsage: { used: 128, total: 512 },
    activeSessions: 2,
    activeCronJobs: 2,
    activeAgents: 0,
    enabledPlugins: 2,
    onlineNodes: 1,
    channels: [
      { name: "cli", status: "online", lastHeartbeat: "刚刚" },
      { name: "terminal", status: "online", lastHeartbeat: "刚刚" },
    ],
  };
}

/** 格式化内存使用 */
function formatMemory(used: number, total: number): string {
  return `${used} MB / ${total} MB`;
}

/** 格式化 JSON 输出 */
function formatJsonOutput(status: GatewayStatus): string {
  return JSON.stringify(
    {
      uptime: status.uptime,
      memory: {
        used_mb: status.memoryUsage.used,
        total_mb: status.memoryUsage.total,
      },
      active_sessions: status.activeSessions,
      active_cron_jobs: status.activeCronJobs,
      active_agents: status.activeAgents,
      enabled_plugins: status.enabledPlugins,
      online_nodes: status.onlineNodes,
      channels: status.channels,
    },
    null,
    2,
  );
}

/** 格式化文本输出 */
function formatTextOutput(status: GatewayStatus): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  系统状态:");
  lines.push(`    运行时间:   ${status.uptime}`);
  lines.push(`    内存使用:   ${formatMemory(status.memoryUsage.used, status.memoryUsage.total)}`);
  lines.push(`    活跃会话:   ${status.activeSessions} 个`);
  lines.push(`    定时任务:   ${status.activeCronJobs} 个 (active)`);
  lines.push(`    子代理:     ${status.activeAgents} 个运行中`);
  lines.push(`    插件:       ${status.enabledPlugins} 个已启用`);
  lines.push(`    节点:       ${status.onlineNodes} 个在线`);
  lines.push("");
  lines.push("  通道状态:");
  for (const channel of status.channels) {
    const statusIcon = channel.status === "online" ? "✓" : channel.status === "offline" ? "✗" : "!";
    lines.push(`    ${statusIcon} ${channel.name.padEnd(12)} ${channel.status.padEnd(8)} (${channel.lastHeartbeat})`);
  }
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 status 命令
 */
export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .aliases(["st"])
    .description("显示 Gateway 状态、通道、会话数等信息")
    .option("--json", "JSON 输出格式")
    .action(async (options: StatusOptions) => {
      const status = getGatewayStatus();
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info(formatTextOutput(status));
      }
    });
}
