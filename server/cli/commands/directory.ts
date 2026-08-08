/**
 * directory 命令
 * 目录服务 (list/lookup/register)
 *
 * 参考 openclaw directory-cli，管理服务目录与发现。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type DirectoryOptions = {
  json?: boolean;
};

interface DirectoryEntry {
  id: string;
  name: string;
  kind: "service" | "agent" | "plugin" | "extension";
  endpoint: string;
  metadata: Record<string, string>;
  registeredAt: string;
}

const DIRECTORY_STORE: Map<string, DirectoryEntry> = new Map<string, DirectoryEntry>([
  [
    "dir-001",
    {
      id: "dir-001",
      name: "wms-core-service",
      kind: "service",
      endpoint: "local://wms-core",
      metadata: { version: "1.2.0", region: "default" },
      registeredAt: "2025-01-01T00:00:00Z",
    } as DirectoryEntry,
  ],
  [
    "dir-002",
    {
      id: "dir-002",
      name: "wms-expert",
      kind: "agent",
      endpoint: "agent://wms-expert",
      metadata: { model: "gpt-4", capabilities: "chat,memory,tasks" },
      registeredAt: "2025-01-02T00:00:00Z",
    } as DirectoryEntry,
  ],
  [
    "dir-003",
    {
      id: "dir-003",
      name: "barcode-scanner",
      kind: "extension",
      endpoint: "ext://barcode-scanner",
      metadata: { version: "1.0.0" },
      registeredAt: "2025-01-05T00:00:00Z",
    } as DirectoryEntry,
  ],
]);

function listDirectory(kind?: string): DirectoryEntry[] {
  const all = Array.from(DIRECTORY_STORE.values());
  if (kind) {
    return all.filter((e) => e.kind === kind);
  }
  return all;
}

function lookup(name: string): DirectoryEntry | undefined {
  return Array.from(DIRECTORY_STORE.values()).find((e) => e.name === name);
}

function registerEntry(params: { name: string; kind: DirectoryEntry["kind"]; endpoint: string }): DirectoryEntry {
  const id = `dir_${Date.now().toString(36)}`;
  const entry: DirectoryEntry = {
    id,
    name: params.name,
    kind: params.kind,
    endpoint: params.endpoint,
    metadata: {},
    registeredAt: new Date().toISOString(),
  };
  DIRECTORY_STORE.set(id, entry);
  return entry;
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

function formatDirectoryList(entries: DirectoryEntry[]): string {
  const lines: string[] = ["", "  目录服务:"];
  for (const e of entries) {
    lines.push(`    ${e.id} [${e.kind}] ${e.name} -> ${e.endpoint}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerDirectoryCommand(program: Command): void {
  const directoryCmd = program
    .command("directory")
    .description("目录服务 (list/lookup/register)")
    .alias("dir");

  directoryCmd
    .command("list")
    .description("列出目录条目")
    .option("--kind <kind>", "按类型过滤 (service/agent/plugin/extension)")
    .option("--json", "JSON 输出格式")
    .action((options: DirectoryOptions & { kind?: string }) => {
      const entries = listDirectory(options.kind);
      if (options.json) {
        logger.info(formatJsonOutput(entries));
      } else {
        logger.info(formatDirectoryList(entries));
      }
    });

  directoryCmd
    .command("lookup <name>")
    .description("按名称查找目录条目")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: DirectoryOptions) => {
      const entry = lookup(name);
      if (!entry) {
        logger.error(`未找到目录条目: ${name}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(entry));
      } else {
        logger.info(formatJsonOutput(entry));
      }
    });

  directoryCmd
    .command("register <name> <kind> <endpoint>")
    .description("注册目录条目")
    .option("--json", "JSON 输出格式")
    .action((name: string, kind: string, endpoint: string, options: DirectoryOptions) => {
      const validKinds: DirectoryEntry["kind"][] = ["service", "agent", "plugin", "extension"];
      if (!validKinds.includes(kind as DirectoryEntry["kind"])) {
        logger.error(`无效类型: ${kind}。可选: ${validKinds.join(", ")}`);
        return;
      }
      const entry = registerEntry({ name, kind: kind as DirectoryEntry["kind"], endpoint });
      logger.info(`已注册: ${entry.id}`);
      if (options.json) {
        logger.info(formatJsonOutput(entry));
      }
    });

  // 默认 list
  directoryCmd
    .option("--json", "JSON 输出格式")
    .action((options: DirectoryOptions) => {
      const entries = listDirectory();
      if (options.json) {
        logger.info(formatJsonOutput(entries));
      } else {
        logger.info(formatDirectoryList(entries));
      }
    });
}
