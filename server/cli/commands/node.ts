/**
 * node 命令
 * 单节点操作 (list/show/invoke/status)
 *
 * 参考 openclaw node-cli，管理与网关连接的节点。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type NodeOptions = {
  json?: boolean;
};

type NodeStatus = "online" | "offline" | "connecting" | "error";

interface NodeEntry {
  id: string;
  name: string;
  platform: string;
  status: NodeStatus;
  address: string;
  lastSeenAt?: string;
  capabilities: string[];
  version: string;
}

const NODE_STORE: Map<string, NodeEntry> = new Map([
  [
    "node-001",
    {
      id: "node-001",
      name: "warehouse-node-1",
      platform: "linux",
      status: "online",
      address: "192.168.1.10:7331",
      lastSeenAt: "2025-01-15T10:00:00Z",
      capabilities: ["chat", "memory", "tasks"],
      version: "1.2.0",
    },
  ],
  [
    "node-002",
    {
      id: "node-002",
      name: "office-node-1",
      platform: "macos",
      status: "online",
      address: "192.168.1.20:7331",
      lastSeenAt: "2025-01-15T09:55:00Z",
      capabilities: ["chat", "wiki"],
      version: "1.2.0",
    },
  ],
  [
    "node-003",
    {
      id: "node-003",
      name: "edge-node-1",
      platform: "linux",
      status: "offline",
      address: "10.0.0.5:7331",
      lastSeenAt: "2025-01-14T18:00:00Z",
      capabilities: ["chat"],
      version: "1.1.0",
    },
  ],
]);

function listNodes(): NodeEntry[] {
  return Array.from(NODE_STORE.values());
}

function getNode(id: string): NodeEntry | undefined {
  return NODE_STORE.get(id);
}

function invokeNode(id: string, capability: string, payload?: string): { success: boolean; result: string } {
  const node = NODE_STORE.get(id);
  if (!node) {
    return { success: false, result: `节点未找到: ${id}` };
  }
  if (node.status !== "online") {
    return { success: false, result: `节点离线: ${id} (${node.status})` };
  }
  if (!node.capabilities.includes(capability)) {
    return { success: false, result: `节点不支持能力: ${capability}` };
  }
  return { success: true, result: `已调用 ${node.name} 的 ${capability} 能力${payload ? ` (负载: ${payload})` : ""}` };
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatNodeList(nodes: NodeEntry[]): string {
  const lines: string[] = ["", "  节点列表:"];
  for (const n of nodes) {
    const icon = n.status === "online" ? "✓" : n.status === "error" ? "✗" : "○";
    lines.push(`    ${icon} ${n.id} ${n.name} [${n.status}] ${n.address}`);
    lines.push(`        平台: ${n.platform}  版本: ${n.version}  能力: ${n.capabilities.join(", ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerNodeCommand(program: Command): void {
  const nodeCmd = program
    .command("node")
    .description("单节点操作 (list/show/invoke/status)");

  nodeCmd
    .command("list")
    .description("列出所有节点")
    .option("--json", "JSON 输出格式")
    .action((options: NodeOptions) => {
      const nodes = listNodes();
      if (options.json) {
        logger.info(formatJsonOutput(nodes));
      } else {
        logger.info(formatNodeList(nodes));
      }
    });

  nodeCmd
    .command("show <id>")
    .description("查看节点详情")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: NodeOptions) => {
      const node = getNode(id);
      if (!node) {
        logger.error(`未找到节点: ${id}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(node));
      } else {
        logger.info(formatJsonOutput(node));
      }
    });

  nodeCmd
    .command("invoke <id> <capability>")
    .description("调用节点能力")
    .option("--payload <json>", "调用负载")
    .option("--json", "JSON 输出格式")
    .action((id: string, capability: string, options: NodeOptions & { payload?: string }) => {
      const result = invokeNode(id, capability, options.payload);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(result.success ? `✓ ${result.result}` : `✗ ${result.result}`);
      }
    });

  nodeCmd
    .command("status")
    .description("查看节点状态摘要")
    .option("--json", "JSON 输出格式")
    .action((options: NodeOptions) => {
      const nodes = listNodes();
      const summary = {
        total: nodes.length,
        online: nodes.filter((n) => n.status === "online").length,
        offline: nodes.filter((n) => n.status === "offline").length,
        error: nodes.filter((n) => n.status === "error").length,
      };
      if (options.json) {
        logger.info(formatJsonOutput(summary));
      } else {
        logger.info(`节点状态: 总计 ${summary.total}, 在线 ${summary.online}, 离线 ${summary.offline}, 错误 ${summary.error}`);
      }
    });

  // 默认 list
  nodeCmd
    .option("--json", "JSON 输出格式")
    .action((options: NodeOptions) => {
      const nodes = listNodes();
      if (options.json) {
        logger.info(formatJsonOutput(nodes));
      } else {
        logger.info(formatNodeList(nodes));
      }
    });
}
