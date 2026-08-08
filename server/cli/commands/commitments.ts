/**
 * commitments 命令
 * 承诺跟踪 (list/show/create/fulfill)
 *
 * 跟踪代理或用户做出的承诺与交付物。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type CommitmentsOptions = {
  json?: boolean;
};

type CommitmentStatus = "open" | "fulfilled" | "broken" | "expired";

interface CommitmentEntry {
  id: string;
  description: string;
  madeBy: string;
  madeTo?: string;
  status: CommitmentStatus;
  dueAt?: string;
  createdAt: string;
  fulfilledAt?: string;
}

const COMMITMENT_STORE: Map<string, CommitmentEntry> = new Map([
  [
    "cm-001",
    {
      id: "cm-001",
      description: "在周五前完成补货报告",
      madeBy: "agent:wms-analyst",
      madeTo: "user:manager",
      status: "open",
      dueAt: "2025-01-17T17:00:00Z",
      createdAt: "2025-01-13T09:00:00Z",
    },
  ],
  [
    "cm-002",
    {
      id: "cm-002",
      description: "修复出库异常检测逻辑",
      madeBy: "agent:wms-expert",
      status: "fulfilled",
      createdAt: "2025-01-10T00:00:00Z",
      fulfilledAt: "2025-01-12T15:00:00Z",
    },
  ],
]);

function listCommitments(status?: string): CommitmentEntry[] {
  const all = Array.from(COMMITMENT_STORE.values());
  if (status) {
    return all.filter((c) => c.status === status);
  }
  return all;
}

function createCommitment(params: { description: string; madeBy: string; dueAt?: string; madeTo?: string }): CommitmentEntry {
  const id = `cm_${Date.now().toString(36)}`;
  const entry: CommitmentEntry = {
    id,
    description: params.description,
    madeBy: params.madeBy,
    madeTo: params.madeTo,
    status: "open",
    dueAt: params.dueAt,
    createdAt: new Date().toISOString(),
  };
  COMMITMENT_STORE.set(id, entry);
  return entry;
}

function fulfillCommitment(id: string): CommitmentEntry | undefined {
  const entry = COMMITMENT_STORE.get(id);
  if (!entry) {
    return undefined;
  }
  entry.status = "fulfilled";
  entry.fulfilledAt = new Date().toISOString();
  return entry;
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

function formatCommitmentList(commitments: CommitmentEntry[]): string {
  const lines: string[] = ["", "  承诺列表:"];
  for (const c of commitments) {
    const icon = c.status === "fulfilled" ? "✓" : c.status === "broken" ? "✗" : c.status === "expired" ? "·" : "○";
    lines.push(`    ${icon} ${c.id} [${c.status}] ${c.description}`);
    lines.push(`        承诺者: ${c.madeBy}${c.dueAt ? `  截止: ${c.dueAt}` : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerCommitmentsCommand(program: Command): void {
  const commitmentsCmd = program
    .command("commitments")
    .description("承诺跟踪 (list/show/create/fulfill)")
    .alias("cm");

  commitmentsCmd
    .command("list")
    .description("列出承诺")
    .option("--status <status>", "按状态过滤")
    .option("--json", "JSON 输出格式")
    .action((options: CommitmentsOptions & { status?: string }) => {
      const commitments = listCommitments(options.status);
      if (options.json) {
        logger.info(formatJsonOutput(commitments));
      } else {
        logger.info(formatCommitmentList(commitments));
      }
    });

  commitmentsCmd
    .command("show <id>")
    .description("查看承诺详情")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: CommitmentsOptions) => {
      const entry = COMMITMENT_STORE.get(id);
      if (!entry) {
        logger.error(`未找到承诺: ${id}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(entry));
      } else {
        logger.info(formatJsonOutput(entry));
      }
    });

  commitmentsCmd
    .command("create <description>")
    .description("创建承诺")
    .requiredOption("--made-by <who>", "承诺者")
    .option("--made-to <to>", "承诺对象")
    .option("--due-at <datetime>", "截止时间 (ISO)")
    .option("--json", "JSON 输出格式")
    .action((description: string, options: CommitmentsOptions & { madeBy: string; madeTo?: string; dueAt?: string }) => {
      const entry = createCommitment({
        description,
        madeBy: options.madeBy,
        madeTo: options.madeTo,
        dueAt: options.dueAt,
      });
      logger.info(`已创建承诺: ${entry.id}`);
      if (options.json) {
        logger.info(formatJsonOutput(entry));
      }
    });

  commitmentsCmd
    .command("fulfill <id>")
    .description("标记承诺为已兑现")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: CommitmentsOptions) => {
      const entry = fulfillCommitment(id);
      if (!entry) {
        logger.error(`未找到承诺: ${id}`);
        return;
      }
      logger.info(`已兑现承诺: ${id}`);
      if (options.json) {
        logger.info(formatJsonOutput(entry));
      }
    });

  // 默认 list
  commitmentsCmd
    .option("--json", "JSON 输出格式")
    .action((options: CommitmentsOptions) => {
      const commitments = listCommitments();
      if (options.json) {
        logger.info(formatJsonOutput(commitments));
      } else {
        logger.info(formatCommitmentList(commitments));
      }
    });
}
