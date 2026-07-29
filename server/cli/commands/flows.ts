/**
 * flows 命令
 * 工作流编排 (list/show/run/cancel)
 *
 * 参考 openclaw flows-cli，管理工作流编排实例。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type FlowsOptions = {
  json?: boolean;
};

type FlowStatus = "running" | "completed" | "failed" | "paused" | "queued";

interface FlowStep {
  name: string;
  status: FlowStatus;
  startedAt?: string;
  endedAt?: string;
}

interface FlowEntry {
  id: string;
  name: string;
  status: FlowStatus;
  steps: FlowStep[];
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

const FLOW_STORE: Map<string, FlowEntry> = new Map([
  [
    "flow-001",
    {
      id: "flow-001",
      name: "inbound-receive-flow",
      status: "running",
      createdAt: "2025-01-15T09:00:00Z",
      startedAt: "2025-01-15T09:00:05Z",
      steps: [
        { name: "scan-barcode", status: "completed", startedAt: "2025-01-15T09:00:05Z", endedAt: "2025-01-15T09:00:10Z" },
        { name: "verify-asn", status: "completed", startedAt: "2025-01-15T09:00:10Z", endedAt: "2025-01-15T09:00:15Z" },
        { name: "putaway", status: "running", startedAt: "2025-01-15T09:00:15Z" },
        { name: "update-inventory", status: "queued" },
      ],
    },
  ],
  [
    "flow-002",
    {
      id: "flow-002",
      name: "outbound-pick-flow",
      status: "completed",
      createdAt: "2025-01-15T08:00:00Z",
      startedAt: "2025-01-15T08:00:05Z",
      endedAt: "2025-01-15T08:30:00Z",
      steps: [
        { name: "allocate-stock", status: "completed", startedAt: "2025-01-15T08:00:05Z", endedAt: "2025-01-15T08:00:10Z" },
        { name: "pick-items", status: "completed", startedAt: "2025-01-15T08:00:10Z", endedAt: "2025-01-15T08:20:00Z" },
        { name: "pack", status: "completed", startedAt: "2025-01-15T08:20:00Z", endedAt: "2025-01-15T08:30:00Z" },
      ],
    },
  ],
]);

function listFlows(): FlowEntry[] {
  return Array.from(FLOW_STORE.values());
}

function getFlow(id: string): FlowEntry | undefined {
  return FLOW_STORE.get(id);
}

function runFlow(name: string): FlowEntry {
  const id = `flow_${Date.now().toString(36)}`;
  const flow: FlowEntry = {
    id,
    name,
    status: "running",
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    steps: [
      { name: "init", status: "completed", startedAt: new Date().toISOString() },
      { name: "process", status: "running", startedAt: new Date().toISOString() },
    ],
  };
  FLOW_STORE.set(id, flow);
  return flow;
}

function cancelFlow(id: string): boolean {
  const flow = FLOW_STORE.get(id);
  if (!flow) {
    return false;
  }
  flow.status = "failed";
  flow.endedAt = new Date().toISOString();
  flow.error = "Cancelled by user";
  return true;
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatFlowList(flows: FlowEntry[]): string {
  const lines: string[] = ["", "  工作流列表:"];
  for (const f of flows) {
    const icon = f.status === "completed" ? "✓" : f.status === "failed" ? "✗" : f.status === "running" ? "→" : "○";
    lines.push(`    ${icon} ${f.id} ${f.name} [${f.status}]`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerFlowsCommand(program: Command): void {
  const flowsCmd = program
    .command("flows")
    .description("工作流编排 (list/show/run/cancel)");

  flowsCmd
    .command("list")
    .description("列出所有工作流")
    .option("--json", "JSON 输出格式")
    .action((options: FlowsOptions) => {
      const flows = listFlows();
      if (options.json) {
        logger.info(formatJsonOutput(flows));
      } else {
        logger.info(formatFlowList(flows));
      }
    });

  flowsCmd
    .command("show <id>")
    .description("查看工作流详情")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: FlowsOptions) => {
      const flow = getFlow(id);
      if (!flow) {
        logger.error(`未找到工作流: ${id}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(flow));
      } else {
        logger.info("");
        logger.info(`  工作流: ${flow.id}`);
        logger.info(`    名称: ${flow.name}`);
        logger.info(`    状态: ${flow.status}`);
        logger.info(`    步骤 (${flow.steps.length}):`);
        for (const step of flow.steps) {
          const icon = step.status === "completed" ? "✓" : step.status === "running" ? "→" : "○";
          logger.info(`      ${icon} ${step.name} [${step.status}]`);
        }
        if (flow.error) {
          logger.info(`    错误: ${flow.error}`);
        }
        logger.info("");
      }
    });

  flowsCmd
    .command("run <name>")
    .description("启动工作流")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: FlowsOptions) => {
      const flow = runFlow(name);
      logger.info(`已启动工作流: ${flow.id}`);
      if (options.json) {
        logger.info(formatJsonOutput(flow));
      }
    });

  flowsCmd
    .command("cancel <id>")
    .description("取消工作流")
    .action((id: string) => {
      const cancelled = cancelFlow(id);
      if (cancelled) {
        logger.info(`已取消工作流: ${id}`);
      } else {
        logger.error(`未找到工作流: ${id}`);
      }
    });

  // 默认 list
  flowsCmd
    .option("--json", "JSON 输出格式")
    .action((options: FlowsOptions) => {
      const flows = listFlows();
      if (options.json) {
        logger.info(formatJsonOutput(flows));
      } else {
        logger.info(formatFlowList(flows));
      }
    });
}
