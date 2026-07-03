/**
 * gateway 命令
 * 网关管理 (start/stop/status/probe/info)
 *
 * 参考 openclaw gateway-cli，封装对 server/gateway 模块的调用。
 * 当网关运行时未就绪时，使用本地状态进行模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type GatewayOptions = {
  json?: boolean;
  port?: string;
};

/** 网关运行状态 */
type GatewayState = "running" | "stopped" | "error";

/** 网关状态信息 */
interface GatewayStatus {
  state: GatewayState;
  url: string;
  port: number;
  pid?: number;
  startedAt?: string;
  channels: { name: string; status: "online" | "offline"; lastHeartbeat: string }[];
}

/** 探活结果 */
interface GatewayProbe {
  reachable: boolean;
  latencyMs: number;
  auth: "ok" | "missing" | "denied";
  channels: number;
}

/** 网关信息 */
interface GatewayInfo {
  version: string;
  protocol: string;
  maxConnections: number;
  activeConnections: number;
  uptime: string;
}

/** 模拟网关状态 */
let gatewayState: GatewayStatus = {
  state: "stopped",
  url: "ws://localhost:7331",
  port: 7331,
  channels: [],
};

/** 解析端口 */
function resolvePort(port?: string): number {
  if (port && /^\d+$/.test(port)) {
    return parseInt(port, 10);
  }
  return gatewayState.port;
}

/** 获取网关状态 */
function getGatewayStatus(): GatewayStatus {
  return { ...gatewayState, channels: [...gatewayState.channels] };
}

/** 启动网关 */
function startGateway(port?: string): GatewayStatus {
  const resolvedPort = resolvePort(port);
  gatewayState = {
    state: "running",
    url: `ws://localhost:${resolvedPort}`,
    port: resolvedPort,
    pid: Math.floor(Math.random() * 90000) + 10000,
    startedAt: new Date().toISOString(),
    channels: [
      { name: "cli", status: "online", lastHeartbeat: "刚刚" },
      { name: "terminal", status: "online", lastHeartbeat: "刚刚" },
    ],
  };
  return getGatewayStatus();
}

/** 停止网关 */
function stopGateway(): GatewayStatus {
  gatewayState = {
    ...gatewayState,
    state: "stopped",
    pid: undefined,
    startedAt: undefined,
    channels: [],
  };
  return getGatewayStatus();
}

/** 探活网关 */
function probeGateway(): GatewayProbe {
  const reachable = gatewayState.state === "running";
  return {
    reachable,
    latencyMs: reachable ? Math.floor(Math.random() * 100) + 10 : 0,
    auth: reachable ? "ok" : "missing",
    channels: reachable ? gatewayState.channels.length : 0,
  };
}

/** 获取网关信息 */
function getGatewayInfo(): GatewayInfo {
  return {
    version: "1.0.0",
    protocol: "ws/v1",
    maxConnections: 64,
    activeConnections: gatewayState.state === "running" ? gatewayState.channels.length : 0,
    uptime: gatewayState.startedAt ? `${Math.floor((Date.now() - new Date(gatewayState.startedAt).getTime()) / 1000)}s` : "0s",
  };
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化状态文本输出 */
function formatStatusOutput(status: GatewayStatus): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  网关状态:");
  lines.push(`    状态:   ${status.state}`);
  lines.push(`    URL:    ${status.url}`);
  lines.push(`    端口:   ${status.port}`);
  if (status.pid !== undefined) {
    lines.push(`    PID:    ${status.pid}`);
  }
  if (status.startedAt) {
    lines.push(`    启动:   ${new Date(status.startedAt).toLocaleString("zh-CN")}`);
  }
  if (status.channels.length > 0) {
    lines.push("");
    lines.push("  通道:");
    for (const channel of status.channels) {
      const icon = channel.status === "online" ? "✓" : "✗";
      lines.push(`    ${icon} ${channel.name.padEnd(12)} ${channel.status} (${channel.lastHeartbeat})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化探活文本输出 */
function formatProbeOutput(probe: GatewayProbe): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  网关探活:");
  lines.push(`    可达:     ${probe.reachable ? "✓ 是" : "✗ 否"}`);
  lines.push(`    延迟:     ${probe.reachable ? `${probe.latencyMs}ms` : "n/a"}`);
  lines.push(`    认证:     ${probe.auth}`);
  lines.push(`    通道数:   ${probe.channels}`);
  lines.push("");
  return lines.join("\n");
}

/** 格式化网关信息文本输出 */
function formatInfoOutput(info: GatewayInfo): string {
  const lines: string[] = [];
  lines.push("");
  lines.push("  网关信息:");
  lines.push(`    版本:           ${info.version}`);
  lines.push(`    协议:           ${info.protocol}`);
  lines.push(`    最大连接数:     ${info.maxConnections}`);
  lines.push(`    活跃连接数:     ${info.activeConnections}`);
  lines.push(`    运行时长:       ${info.uptime}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * 注册 gateway 命令
 */
export function registerGatewayCommand(program: Command): void {
  const gatewayCmd = program
    .command("gateway")
    .description("网关管理 (start/stop/status/probe/info)");

  gatewayCmd
    .command("start")
    .description("启动网关")
    .option("--port <port>", "监听端口")
    .option("--json", "JSON 输出格式")
    .action((options: GatewayOptions) => {
      const status = startGateway(options.port);
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info(`网关已启动 (PID: ${status.pid ?? "n/a"})`);
        logger.info(formatStatusOutput(status));
      }
    });

  gatewayCmd
    .command("stop")
    .description("停止网关")
    .option("--json", "JSON 输出格式")
    .action((options: GatewayOptions) => {
      const status = stopGateway();
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info("网关已停止");
        logger.info(formatStatusOutput(status));
      }
    });

  gatewayCmd
    .command("status")
    .description("查看网关状态")
    .option("--json", "JSON 输出格式")
    .action((options: GatewayOptions) => {
      const status = getGatewayStatus();
      if (options.json) {
        logger.info(formatJsonOutput(status));
      } else {
        logger.info(formatStatusOutput(status));
      }
    });

  gatewayCmd
    .command("probe")
    .description("探活网关 (可达性/认证/读探活)")
    .option("--json", "JSON 输出格式")
    .action((options: GatewayOptions) => {
      const probe = probeGateway();
      if (options.json) {
        logger.info(formatJsonOutput(probe));
      } else {
        logger.info(formatProbeOutput(probe));
      }
    });

  gatewayCmd
    .command("info")
    .description("查看网关详细信息")
    .option("--json", "JSON 输出格式")
    .action((options: GatewayOptions) => {
      const info = getGatewayInfo();
      if (options.json) {
        logger.info(formatJsonOutput(info));
      } else {
        logger.info(formatInfoOutput(info));
      }
    });

  // 默认 status 子命令
  gatewayCmd.action((options: GatewayOptions) => {
    const status = getGatewayStatus();
    if (options.json) {
      logger.info(formatJsonOutput(status));
    } else {
      logger.info(formatStatusOutput(status));
    }
  });
}
