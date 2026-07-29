/**
 * workboard 命令
 * 工作板管理 (list/show/create/update)
 *
 * 提供工作板条目的查看与管理能力。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type WorkboardOptions = {
  json?: boolean;
};

type ItemStatus = "todo" | "in_progress" | "done" | "blocked";
type ItemPriority = "low" | "medium" | "high" | "urgent";

interface WorkboardItem {
  id: string;
  title: string;
  description?: string;
  status: ItemStatus;
  priority: ItemPriority;
  assignee?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const WORKBOARD_STORE: Map<string, WorkboardItem> = new Map([
  [
    "wb-001",
    {
      id: "wb-001",
      title: "补货策略优化",
      description: "分析历史出库数据，优化补货阈值",
      status: "in_progress",
      priority: "high",
      assignee: "agent:wms-analyst",
      tags: ["inventory", "optimization"],
      createdAt: "2025-01-10T00:00:00Z",
      updatedAt: "2025-01-15T09:00:00Z",
    },
  ],
  [
    "wb-002",
    {
      id: "wb-002",
      title: "仓库布局调整",
      status: "todo",
      priority: "medium",
      tags: ["layout"],
      createdAt: "2025-01-12T00:00:00Z",
      updatedAt: "2025-01-12T00:00:00Z",
    },
  ],
  [
    "wb-003",
    {
      id: "wb-003",
      title: "出库异常排查",
      status: "blocked",
      priority: "urgent",
      assignee: "agent:wms-expert",
      tags: ["exception", "outbound"],
      createdAt: "2025-01-14T00:00:00Z",
      updatedAt: "2025-01-14T10:00:00Z",
    },
  ],
]);

function listItems(filter?: { status?: ItemStatus; priority?: ItemPriority; assignee?: string }): WorkboardItem[] {
  let items = Array.from(WORKBOARD_STORE.values());
  if (filter?.status) {
    items = items.filter((i) => i.status === filter.status);
  }
  if (filter?.priority) {
    items = items.filter((i) => i.priority === filter.priority);
  }
  if (filter?.assignee) {
    items = items.filter((i) => i.assignee === filter.assignee);
  }
  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function getItem(id: string): WorkboardItem | undefined {
  return WORKBOARD_STORE.get(id);
}

function createItem(params: { title: string; priority?: ItemPriority; assignee?: string; tags?: string[] }): WorkboardItem {
  const id = `wb_${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const item: WorkboardItem = {
    id,
    title: params.title,
    status: "todo",
    priority: params.priority || "medium",
    assignee: params.assignee,
    tags: params.tags || [],
    createdAt: now,
    updatedAt: now,
  };
  WORKBOARD_STORE.set(id, item);
  return item;
}

function updateItem(id: string, updates: Partial<Pick<WorkboardItem, "status" | "priority" | "assignee" | "title">>): WorkboardItem | undefined {
  const item = WORKBOARD_STORE.get(id);
  if (!item) {
    return undefined;
  }
  if (updates.status) item.status = updates.status;
  if (updates.priority) item.priority = updates.priority;
  if (updates.assignee !== undefined) item.assignee = updates.assignee;
  if (updates.title) item.title = updates.title;
  item.updatedAt = new Date().toISOString();
  return item;
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatItemList(items: WorkboardItem[]): string {
  const lines: string[] = ["", "  工作板:"];
  for (const item of items) {
    const icon = item.status === "done" ? "✓" : item.status === "blocked" ? "✗" : item.status === "in_progress" ? "→" : "○";
    lines.push(`    ${icon} ${item.id} [${item.priority}] ${item.title} (${item.status})`);
    if (item.assignee) {
      lines.push(`        负责人: ${item.assignee}  标签: ${item.tags.join(", ") || "无"}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function registerWorkboardCommand(program: Command): void {
  const workboardCmd = program
    .command("workboard")
    .description("工作板管理 (list/show/create/update)")
    .alias("wb");

  workboardCmd
    .command("list")
    .description("列出工作板条目")
    .option("--status <status>", "按状态过滤")
    .option("--priority <priority>", "按优先级过滤")
    .option("--assignee <assignee>", "按负责人过滤")
    .option("--json", "JSON 输出格式")
    .action((options: WorkboardOptions & { status?: ItemStatus; priority?: ItemPriority; assignee?: string }) => {
      const items = listItems(options);
      if (options.json) {
        logger.info(formatJsonOutput(items));
      } else {
        logger.info(formatItemList(items));
      }
    });

  workboardCmd
    .command("show <id>")
    .description("查看条目详情")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: WorkboardOptions) => {
      const item = getItem(id);
      if (!item) {
        logger.error(`未找到条目: ${id}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(item));
      } else {
        logger.info(formatJsonOutput(item));
      }
    });

  workboardCmd
    .command("create <title>")
    .description("创建工作板条目")
    .option("--priority <priority>", "优先级 (low/medium/high/urgent)", "medium")
    .option("--assignee <assignee>", "负责人")
    .option("--tags <tags>", "标签（逗号分隔）")
    .option("--json", "JSON 输出格式")
    .action((title: string, options: WorkboardOptions & { priority?: ItemPriority; assignee?: string; tags?: string }) => {
      const item = createItem({
        title,
        priority: options.priority,
        assignee: options.assignee,
        tags: options.tags ? options.tags.split(",").map((t) => t.trim()) : undefined,
      });
      logger.info(`已创建条目: ${item.id}`);
      if (options.json) {
        logger.info(formatJsonOutput(item));
      }
    });

  workboardCmd
    .command("update <id>")
    .description("更新工作板条目")
    .option("--status <status>", "新状态")
    .option("--priority <priority>", "新优先级")
    .option("--assignee <assignee>", "新负责人")
    .option("--title <title>", "新标题")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: WorkboardOptions & { status?: ItemStatus; priority?: ItemPriority; assignee?: string; title?: string }) => {
      const item = updateItem(id, options);
      if (!item) {
        logger.error(`未找到条目: ${id}`);
        return;
      }
      logger.info(`已更新条目: ${id}`);
      if (options.json) {
        logger.info(formatJsonOutput(item));
      }
    });

  // 默认 list
  workboardCmd
    .option("--json", "JSON 输出格式")
    .action((options: WorkboardOptions) => {
      const items = listItems();
      if (options.json) {
        logger.info(formatJsonOutput(items));
      } else {
        logger.info(formatItemList(items));
      }
    });
}
