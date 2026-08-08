/**
 * approvals 命令
 * 审批管理 (list/approve/reject/show)
 *
 * 参考 openclaw exec-approvals-cli，管理待审批的操作请求。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type ApprovalsOptions = {
  json?: boolean;
};

type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

interface ApprovalEntry {
  id: string;
  action: string;
  resource: string;
  requester: string;
  status: ApprovalStatus;
  reason?: string;
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

const APPROVAL_STORE: Map<string, ApprovalEntry> = new Map([
  [
    "ap-001",
    {
      id: "ap-001",
      action: "deploy",
      resource: "wms-service:v1.2.3",
      requester: "agent:wms-deployer",
      status: "pending",
      createdAt: "2025-01-15T09:00:00Z",
    },
  ],
  [
    "ap-002",
    {
      id: "ap-002",
      action: "data-export",
      resource: "inventory:all",
      requester: "agent:wms-analyst",
      status: "pending",
      createdAt: "2025-01-15T09:30:00Z",
    },
  ],
  [
    "ap-003",
    {
      id: "ap-003",
      action: "config-change",
      resource: "gateway.authMode",
      requester: "user:admin",
      status: "approved",
      createdAt: "2025-01-14T10:00:00Z",
      decidedAt: "2025-01-14T10:05:00Z",
      decidedBy: "user:superadmin",
    },
  ],
]);

function listApprovals(status?: string): ApprovalEntry[] {
  const all = Array.from(APPROVAL_STORE.values());
  if (status) {
    return all.filter((a) => a.status === status);
  }
  return all;
}

function decideApproval(id: string, decision: "approved" | "rejected", reason?: string): ApprovalEntry | undefined {
  const entry = APPROVAL_STORE.get(id);
  if (!entry) {
    return undefined;
  }
  entry.status = decision;
  entry.reason = reason;
  entry.decidedAt = new Date().toISOString();
  entry.decidedBy = "cli-user";
  return entry;
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

function formatApprovalList(approvals: ApprovalEntry[]): string {
  const lines: string[] = ["", "  审批列表:"];
  for (const a of approvals) {
    const icon = a.status === "approved" ? "✓" : a.status === "rejected" ? "✗" : a.status === "expired" ? "·" : "⏳";
    lines.push(`    ${icon} ${a.id} [${a.status}] ${a.action} -> ${a.resource}`);
    lines.push(`        请求者: ${a.requester}  创建: ${a.createdAt}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerApprovalsCommand(program: Command): void {
  const approvalsCmd = program
    .command("approvals")
    .description("审批管理 (list/approve/reject/show)")
    .alias("apv");

  approvalsCmd
    .command("list")
    .description("列出审批请求")
    .option("--status <status>", "按状态过滤 (pending/approved/rejected/expired)")
    .option("--json", "JSON 输出格式")
    .action((options: ApprovalsOptions & { status?: string }) => {
      const approvals = listApprovals(options.status);
      if (options.json) {
        logger.info(formatJsonOutput(approvals));
      } else {
        logger.info(formatApprovalList(approvals));
      }
    });

  approvalsCmd
    .command("approve <id>")
    .description("批准审批请求")
    .option("--reason <reason>", "批准理由")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: ApprovalsOptions & { reason?: string }) => {
      const entry = decideApproval(id, "approved", options.reason);
      if (!entry) {
        logger.error(`未找到审批: ${id}`);
        return;
      }
      logger.info(`已批准: ${id}`);
      if (options.json) {
        logger.info(formatJsonOutput(entry));
      }
    });

  approvalsCmd
    .command("reject <id>")
    .description("拒绝审批请求")
    .option("--reason <reason>", "拒绝理由")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: ApprovalsOptions & { reason?: string }) => {
      const entry = decideApproval(id, "rejected", options.reason);
      if (!entry) {
        logger.error(`未找到审批: ${id}`);
        return;
      }
      logger.info(`已拒绝: ${id}`);
      if (options.json) {
        logger.info(formatJsonOutput(entry));
      }
    });

  approvalsCmd
    .command("show <id>")
    .description("查看审批详情")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: ApprovalsOptions) => {
      const entry = APPROVAL_STORE.get(id);
      if (!entry) {
        logger.error(`未找到审批: ${id}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(entry));
      } else {
        logger.info(formatJsonOutput(entry));
      }
    });

  // 默认 list
  approvalsCmd
    .option("--status <status>", "按状态过滤")
    .option("--json", "JSON 输出格式")
    .action((options: ApprovalsOptions & { status?: string }) => {
      const approvals = listApprovals(options.status);
      if (options.json) {
        logger.info(formatJsonOutput(approvals));
      } else {
        logger.info(formatApprovalList(approvals));
      }
    });
}
