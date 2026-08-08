/**
 * migrate 命令
 * 迁移工具 (list/run/status)
 *
 * 参考 openclaw migrate-cli，管理数据迁移脚本。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type MigrateOptions = {
  json?: boolean;
  dryRun?: boolean;
};

interface MigrationEntry {
  id: string;
  name: string;
  version: string;
  status: "pending" | "applied" | "failed";
  appliedAt?: string;
  description: string;
}

const MIGRATION_STORE: Map<string, MigrationEntry> = new Map([
  [
    "m-001",
    {
      id: "m-001",
      name: "init-schema",
      version: "1.0.0",
      status: "applied",
      appliedAt: "2025-01-01T00:00:00Z",
      description: "初始化数据库 schema",
    },
  ],
  [
    "m-002",
    {
      id: "m-002",
      name: "add-memory-table",
      version: "1.1.0",
      status: "applied",
      appliedAt: "2025-01-05T00:00:00Z",
      description: "添加记忆存储表",
    },
  ],
  [
    "m-003",
    {
      id: "m-003",
      name: "add-workboard-table",
      version: "1.2.0",
      status: "pending",
      description: "添加工作板表结构",
    },
  ],
]);

function listMigrations(): MigrationEntry[] {
  return Array.from(MIGRATION_STORE.values());
}

function getPendingMigrations(): MigrationEntry[] {
  return listMigrations().filter((m) => m.status === "pending");
}

function runMigrations(dryRun: boolean): { applied: string[]; skipped: string[]; failed: string[] } {
  const applied: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const m of MIGRATION_STORE.values()) {
    if (m.status !== "pending") {
      skipped.push(m.id);
      continue;
    }
    if (!dryRun) {
      m.status = "applied";
      m.appliedAt = new Date().toISOString();
    }
    applied.push(m.id);
  }
  return { applied, skipped, failed };
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

function formatMigrationList(migrations: MigrationEntry[]): string {
  const lines: string[] = ["", "  迁移列表:"];
  for (const m of migrations) {
    const icon = m.status === "applied" ? "✓" : m.status === "failed" ? "✗" : "○";
    lines.push(`    ${icon} ${m.id} ${m.name} (v${m.version}) [${m.status}]`);
    lines.push(`        ${m.description}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerMigrateCommand(program: Command): void {
  const migrateCmd = program
    .command("migrate")
    .description("迁移工具 (list/run/status)");

  migrateCmd
    .command("list")
    .description("列出所有迁移")
    .option("--json", "JSON 输出格式")
    .action((options: MigrateOptions) => {
      const migrations = listMigrations();
      if (options.json) {
        logger.info(formatJsonOutput(migrations));
      } else {
        logger.info(formatMigrationList(migrations));
      }
    });

  migrateCmd
    .command("run")
    .description("执行待处理的迁移")
    .option("--dry-run", "仅预检不写入")
    .option("--json", "JSON 输出格式")
    .action((options: MigrateOptions) => {
      const result = runMigrations(Boolean(options.dryRun));
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(
          options.dryRun
            ? `预检完成: 将应用 ${result.applied.length} 项，跳过 ${result.skipped.length} 项`
            : `迁移完成: 已应用 ${result.applied.length} 项，跳过 ${result.skipped.length} 项`,
        );
      }
    });

  migrateCmd
    .command("status")
    .description("查看迁移状态摘要")
    .option("--json", "JSON 输出格式")
    .action((options: MigrateOptions) => {
      const migrations = listMigrations();
      const summary = {
        total: migrations.length,
        applied: migrations.filter((m) => m.status === "applied").length,
        pending: migrations.filter((m) => m.status === "pending").length,
        failed: migrations.filter((m) => m.status === "failed").length,
      };
      if (options.json) {
        logger.info(formatJsonOutput(summary));
      } else {
        logger.info(`迁移状态: 总计 ${summary.total}, 已应用 ${summary.applied}, 待处理 ${summary.pending}, 失败 ${summary.failed}`);
      }
    });

  // 默认 list
  migrateCmd
    .option("--json", "JSON 输出格式")
    .action((options: MigrateOptions) => {
      const migrations = listMigrations();
      if (options.json) {
        logger.info(formatJsonOutput(migrations));
      } else {
        logger.info(formatMigrationList(migrations));
      }
    });
}
