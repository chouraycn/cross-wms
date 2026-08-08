/**
 * path 命令
 * 路径查询 (config/data/logs/bin/cache)
 *
 * 查询 cross-wms 各类文件系统路径。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type PathOptions = {
  json?: boolean;
};

interface PathEntry {
  name: string;
  path: string;
  description: string;
  exists: boolean;
}

function getPaths(): PathEntry[] {
  return [
    { name: "config", path: "~/.cdfknow/config/config.json", description: "用户配置文件", exists: true },
    { name: "data", path: "~/.cdfknow/data/", description: "数据目录", exists: true },
    { name: "logs", path: "~/.cdfknow/logs/", description: "日志目录", exists: true },
    { name: "bin", path: "/usr/local/bin/cdfknow", description: "CLI 可执行文件", exists: true },
    { name: "cache", path: "~/.cdfknow/cache/", description: "缓存目录", exists: false },
    { name: "sessions", path: "~/.cdfknow/sessions/", description: "会话目录", exists: true },
    { name: "memory", path: "~/.cdfknow/memory/", description: "记忆目录", exists: true },
    { name: "models", path: "~/.cdfknow/ai-models/", description: "模型目录", exists: true },
    { name: "skills", path: "~/.cdfknow/skills/", description: "技能目录", exists: true },
    { name: "plugins", path: "~/.cdfknow/plugins/", description: "插件目录", exists: false },
  ];
}

function getPath(name: string): PathEntry | undefined {
  return getPaths().find((p) => p.name === name);
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

export function registerPathCommand(program: Command): void {
  const pathCmd = program
    .command("path")
    .description("路径查询 (config/data/logs/bin/cache)");

  pathCmd
    .command("list")
    .description("列出所有路径")
    .option("--json", "JSON 输出格式")
    .action((options: PathOptions) => {
      const paths = getPaths();
      if (options.json) {
        logger.info(formatJsonOutput(paths));
      } else {
        logger.info("");
        logger.info("  路径列表:");
        for (const p of paths) {
          const icon = p.exists ? "✓" : "✗";
          logger.info(`    ${icon} ${p.name.padEnd(10)} ${p.path}`);
          logger.info(`        ${p.description}`);
        }
        logger.info("");
      }
    });

  pathCmd
    .command("show <name>")
    .description("查看指定路径")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: PathOptions) => {
      const entry = getPath(name);
      if (!entry) {
        logger.error(`未找到路径: ${name}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(entry));
      } else {
        logger.info(entry.path);
      }
    });

  // 快捷子命令
  for (const name of ["config", "data", "logs", "bin", "cache"]) {
    pathCmd
      .command(name)
      .description(`显示 ${name} 路径`)
      .action(() => {
        const entry = getPath(name);
        if (entry) {
          logger.info(entry.path);
        }
      });
  }

  // 默认 list
  pathCmd
    .option("--json", "JSON 输出格式")
    .action((options: PathOptions) => {
      const paths = getPaths();
      if (options.json) {
        logger.info(formatJsonOutput(paths));
      } else {
        for (const p of paths) {
          logger.info(`${p.name}: ${p.path}`);
        }
      }
    });
}
