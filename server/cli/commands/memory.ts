/**
 * memory 命令
 * 记忆管理 (list/search/add/delete/sync)
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type MemoryOptions = {
  json?: boolean;
};

/** 记忆条目 */
interface MemoryItem {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  embedding?: number[];
}

/** 模拟记忆存储 */
const MEMORY_STORE: Map<string, MemoryItem> = new Map([
  [
    "mem-001",
    {
      id: "mem-001",
      content: "用户偏好使用 TypeScript 进行开发",
      tags: ["preference", "development"],
      createdAt: "2025-01-15T10:00:00Z",
      updatedAt: "2025-01-15T10:00:00Z",
    },
  ],
  [
    "mem-002",
    {
      id: "mem-002",
      content: "项目使用 React + Vite 技术栈",
      tags: ["project", "tech-stack"],
      createdAt: "2025-01-16T14:30:00Z",
      updatedAt: "2025-01-16T14:30:00Z",
    },
  ],
  [
    "mem-003",
    {
      id: "mem-003",
      content: "默认代码风格为 ESLint + Prettier",
      tags: ["preference", "code-style"],
      createdAt: "2025-01-17T09:15:00Z",
      updatedAt: "2025-01-17T09:15:00Z",
    },
  ],
]);

/** 获取所有记忆 */
function getAllMemories(): MemoryItem[] {
  return Array.from(MEMORY_STORE.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** 搜索记忆 */
function searchMemories(query: string): MemoryItem[] {
  const lowerQuery = query.toLowerCase();
  return getAllMemories().filter(
    (item) =>
      item.content.toLowerCase().includes(lowerQuery) ||
      item.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/** 添加记忆 */
function addMemory(content: string, tags: string[] = []): MemoryItem {
  const id = `mem-${Date.now()}`;
  const now = new Date().toISOString();
  const item: MemoryItem = {
    id,
    content,
    tags,
    createdAt: now,
    updatedAt: now,
  };
  MEMORY_STORE.set(id, item);
  return item;
}

/** 删除记忆 */
function deleteMemory(id: string): boolean {
  return MEMORY_STORE.delete(id);
}

/** 同步记忆到向量库 */
function syncMemories(): { synced: number; total: number } {
  const memories = getAllMemories();
  let synced = 0;
  for (const memory of memories) {
    // 模拟向量嵌入
    memory.embedding = new Array(128).fill(0).map(() => Math.random());
    synced++;
  }
  return { synced, total: memories.length };
}

/** 格式化 JSON 输出 */
function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/** 格式化记忆列表文本输出 */
function formatMemoryList(memories: MemoryItem[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  记忆条目 (共 ${memories.length} 条):`);
  lines.push("");
  for (const memory of memories) {
    const tags = memory.tags.length > 0 ? ` [${memory.tags.join(", ")}]` : "";
    lines.push(`  ${memory.id}`);
    lines.push(`    内容: ${memory.content}`);
    lines.push(`    标签: ${tags || "无"}`);
    lines.push(`    创建: ${new Date(memory.createdAt).toLocaleString("zh-CN")}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** 格式化搜索结果文本输出 */
function formatSearchResult(query: string, memories: MemoryItem[]): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(`  搜索 "${query}" 找到 ${memories.length} 条记忆:`);
  lines.push("");
  for (const memory of memories) {
    const tags = memory.tags.length > 0 ? ` [${memory.tags.join(", ")}]` : "";
    lines.push(`  ${memory.id}: ${memory.content}${tags}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** 格式化添加记忆文本输出 */
function formatAddMemory(memory: MemoryItem): string {
  return `已添加记忆 ${memory.id}: ${memory.content}`;
}

/** 格式化删除记忆文本输出 */
function formatDeleteMemory(id: string, success: boolean): string {
  return success ? `已删除记忆 ${id}` : `记忆 ${id} 不存在`;
}

/** 格式化同步记忆文本输出 */
function formatSyncMemory(result: { synced: number; total: number }): string {
  return `已同步 ${result.synced}/${result.total} 条记忆到向量库`;
}

/**
 * 注册 memory 命令
 */
export function registerMemoryCommand(program: Command): void {
  const memoryCmd = program
    .command("memory")
    .description("记忆管理 (list/search/add/delete/sync)");

  // list 子命令
  memoryCmd
    .command("list")
    .description("列出所有记忆条目")
    .option("--json", "JSON 输出格式")
    .action((options: MemoryOptions) => {
      const memories = getAllMemories();
      if (options.json) {
        logger.info(formatJsonOutput(memories));
      } else {
        logger.info(formatMemoryList(memories));
      }
    });

  // search 子命令
  memoryCmd
    .command("search <query>")
    .description("搜索记忆")
    .option("--json", "JSON 输出格式")
    .action((query: string, options: MemoryOptions) => {
      const memories = searchMemories(query);
      if (options.json) {
        logger.info(formatJsonOutput({ query, results: memories, count: memories.length }));
      } else {
        logger.info(formatSearchResult(query, memories));
      }
    });

  // add 子命令
  memoryCmd
    .command("add <content>")
    .description("添加记忆")
    .option("-t, --tags <tags>", "标签 (逗号分隔)")
    .option("--json", "JSON 输出格式")
    .action((content: string, options: MemoryOptions & { tags?: string }) => {
      const tags = options.tags ? options.tags.split(",").map((t) => t.trim()) : [];
      const memory = addMemory(content, tags);
      if (options.json) {
        logger.info(formatJsonOutput(memory));
      } else {
        logger.info(formatAddMemory(memory));
      }
    });

  // delete 子命令
  memoryCmd
    .command("delete <id>")
    .description("删除记忆")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: MemoryOptions) => {
      const success = deleteMemory(id);
      if (options.json) {
        logger.info(formatJsonOutput({ id, success }));
      } else {
        logger.info(formatDeleteMemory(id, success));
      }
    });

  // sync 子命令
  memoryCmd
    .command("sync")
    .description("同步记忆到向量库")
    .option("--json", "JSON 输出格式")
    .action((options: MemoryOptions) => {
      const result = syncMemories();
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(formatSyncMemory(result));
      }
    });

  // 默认 list 子命令
  memoryCmd.action((options: MemoryOptions) => {
    const memories = getAllMemories();
    if (options.json) {
      logger.info(formatJsonOutput(memories));
    } else {
      logger.info(formatMemoryList(memories));
    }
  });
}