import type { Command } from "commander";
import { logger } from "../../logger.js";
import { getSessionBindingService } from "../../engine/bindings/session-binding-service.js";
import { listBindings } from "../../engine/routing/bindings.js";
import { pluginRuntimeRegistry } from "../../engine/plugins/registry.js";

export type StatusOptions = {
  json?: boolean;
  verbose?: boolean;
};

interface ChannelStatus {
  name: string;
  status: "online" | "offline" | "error";
  lastHeartbeat: string;
}

interface AgentStatus {
  agentId: string;
  isDefault: boolean;
  sessionCount: number;
}

interface PluginStatus {
  id: string;
  status: "loaded" | "error" | "inactive";
  origin?: string;
}

interface SystemStatus {
  uptime: string;
  memoryUsage: { used: number; total: number };
  activeConnections: number;
  activeSessions: number;
  activeRuns: number;
  queuedTasks: number;
  activeCronJobs: number;
  enabledPlugins: number;
  onlineNodes: number;
  channels: ChannelStatus[];
  agents: AgentStatus[];
  plugins: PluginStatus[];
  bindings: number;
  lastActivityAt: string;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours % 24 > 0) parts.push(`${hours % 24}小时`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}分钟`);
  if (seconds % 60 > 0 && days === 0) parts.push(`${seconds % 60}秒`);

  return parts.join(" ") || "刚刚";
}

function formatMemory(used: number, total: number): string {
  return `${used} MB / ${total} MB`;
}

function formatTimestamp(ms: number): string {
  if (!ms) return "从未";
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  return "刚刚";
}

function getMemoryUsage(): { used: number; total: number } {
  const mem = process.memoryUsage();
  return {
    used: Math.round(mem.rss / 1024 / 1024),
    total: Math.round(mem.heapTotal / 1024 / 1024),
  };
}

function getPluginsStatus(): PluginStatus[] {
  const entries = pluginRuntimeRegistry.list();
  return entries.map((entry) => ({
    id: entry.pluginId,
    status: entry.status === "enabled" ? "loaded" : entry.status === "error" ? "error" : "inactive",
    origin: entry.manifest?.name,
  }));
}

function getAgentsStatus(): AgentStatus[] {
  const bindingService = getSessionBindingService();
  const bindings = bindingService.listBySession("");
  const agentMap = new Map<string, number>();

  for (const binding of bindings) {
    const agentId = binding.targetSessionKey.split(":")[0] || "default";
    agentMap.set(agentId, (agentMap.get(agentId) || 0) + 1);
  }

  return Array.from(agentMap.entries()).map(([agentId, sessionCount], index) => ({
    agentId,
    isDefault: index === 0,
    sessionCount,
  }));
}

function getGatewayStatus(_options: StatusOptions): SystemStatus {
  const memoryUsage = getMemoryUsage();
  const plugins = getPluginsStatus();
  const agents = getAgentsStatus();
  const bindings = listBindings().length;

  return {
    uptime: formatUptime(process.uptime() * 1000),
    memoryUsage,
    activeConnections: 0,
    activeSessions: agents.reduce((sum, a) => sum + a.sessionCount, 0),
    activeRuns: 0,
    queuedTasks: 0,
    activeCronJobs: 0,
    enabledPlugins: plugins.filter((p) => p.status === "loaded").length,
    onlineNodes: 1,
    channels: [
      { name: "cli", status: "online", lastHeartbeat: "刚刚" },
      { name: "terminal", status: "online", lastHeartbeat: "刚刚" },
    ],
    agents,
    plugins,
    bindings,
    lastActivityAt: formatTimestamp(Date.now()),
  };
}

function formatJsonOutput(status: SystemStatus): string {
  return JSON.stringify(
    {
      uptime: status.uptime,
      memory: {
        used_mb: status.memoryUsage.used,
        total_mb: status.memoryUsage.total,
      },
      active_connections: status.activeConnections,
      active_sessions: status.activeSessions,
      active_runs: status.activeRuns,
      queued_tasks: status.queuedTasks,
      active_cron_jobs: status.activeCronJobs,
      enabled_plugins: status.enabledPlugins,
      online_nodes: status.onlineNodes,
      bindings: status.bindings,
      last_activity_at: status.lastActivityAt,
      channels: status.channels,
      agents: status.agents,
      plugins: status.plugins,
    },
    null,
    2,
  );
}

function formatTextOutput(status: SystemStatus, verbose: boolean): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  系统状态:");
  lines.push(`    运行时间:   ${status.uptime}`);
  lines.push(`    内存使用:   ${formatMemory(status.memoryUsage.used, status.memoryUsage.total)}`);
  lines.push(`    活跃连接:   ${status.activeConnections} 个`);
  lines.push(`    活跃会话:   ${status.activeSessions} 个`);
  lines.push(`    运行中任务: ${status.activeRuns} 个`);
  lines.push(`    队列任务:   ${status.queuedTasks} 个`);
  lines.push(`    定时任务:   ${status.activeCronJobs} 个 (active)`);
  lines.push(`    插件:       ${status.enabledPlugins} 个已启用`);
  lines.push(`    节点:       ${status.onlineNodes} 个在线`);
  lines.push(`    绑定数:     ${status.bindings} 个`);
  lines.push(`    最后活动:   ${status.lastActivityAt}`);
  lines.push("");

  if (status.agents.length > 0) {
    lines.push("  代理状态:");
    for (const agent of status.agents) {
      const defaultMark = agent.isDefault ? " (默认)" : "";
      lines.push(`    ✓ ${agent.agentId}${defaultMark}: ${agent.sessionCount} 个会话`);
    }
    lines.push("");
  }

  lines.push("  通道状态:");
  for (const channel of status.channels) {
    const statusIcon = channel.status === "online" ? "✓" : channel.status === "offline" ? "✗" : "!";
    lines.push(`    ${statusIcon} ${channel.name.padEnd(12)} ${channel.status.padEnd(8)} (${channel.lastHeartbeat})`);
  }
  lines.push("");

  if (verbose && status.plugins.length > 0) {
    lines.push("  插件状态:");
    for (const plugin of status.plugins) {
      const statusIcon = plugin.status === "loaded" ? "✓" : plugin.status === "error" ? "✗" : "○";
      const origin = plugin.origin ? ` [${plugin.origin}]` : "";
      lines.push(`    ${statusIcon} ${plugin.id.padEnd(20)} ${plugin.status.padEnd(8)}${origin}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .aliases(["st"])
    .description("显示 Gateway 状态、通道、会话数等信息")
    .option("--json", "JSON 输出格式")
    .option("-v, --verbose", "显示详细信息")
    .action(async (options: StatusOptions) => {
      const status = getGatewayStatus(options);
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info(formatTextOutput(status, options.verbose ?? false));
      }
    });
}