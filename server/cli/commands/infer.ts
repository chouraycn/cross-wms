/**
 * infer 命令
 * 能力推断 (capabilities/probe/match)
 *
 * 参考 openclaw capability-cli，推断系统能力与可用功能。
 * 使用本地内存状态模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type InferOptions = {
  json?: boolean;
};

interface Capability {
  name: string;
  available: boolean;
  version?: string;
  description: string;
}

function getCapabilities(): Capability[] {
  return [
    { name: "chat", available: true, version: "1.2.0", description: "聊天对话" },
    { name: "memory", available: true, version: "1.1.0", description: "记忆管理" },
    { name: "wiki", available: true, version: "1.0.0", description: "知识库" },
    { name: "tasks", available: true, version: "1.0.0", description: "任务管理" },
    { name: "voicecall", available: false, description: "语音通话" },
    { name: "browser", available: true, version: "0.9.0", description: "浏览器自动化" },
    { name: "sandbox", available: true, version: "1.0.0", description: "沙箱执行" },
    { name: "mcp", available: false, description: "MCP 协议支持" },
  ];
}

function probeCapability(name: string): { name: string; available: boolean; latencyMs?: number } {
  const caps = getCapabilities();
  const cap = caps.find((c) => c.name === name);
  if (!cap) {
    return { name, available: false };
  }
  return { name, available: cap.available, latencyMs: cap.available ? 12 : undefined };
}

function matchCapabilities(query: string): Capability[] {
  const caps = getCapabilities();
  const q = query.toLowerCase();
  return caps.filter((c) => c.name.includes(q) || c.description.toLowerCase().includes(q));
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function registerInferCommand(program: Command): void {
  const inferCmd = program
    .command("infer")
    .description("能力推断 (capabilities/probe/match)");

  inferCmd
    .command("capabilities")
    .description("列出所有能力")
    .option("--available-only", "仅显示可用能力")
    .option("--json", "JSON 输出格式")
    .action((options: InferOptions & { availableOnly?: boolean }) => {
      let caps = getCapabilities();
      if (options.availableOnly) {
        caps = caps.filter((c) => c.available);
      }
      if (options.json) {
        logger.info(formatJsonOutput(caps));
      } else {
        logger.info("系统能力:");
        for (const c of caps) {
          const icon = c.available ? "✓" : "✗";
          logger.info(`  ${icon} ${c.name}${c.version ? ` v${c.version}` : ""} - ${c.description}`);
        }
      }
    });

  inferCmd
    .command("probe <name>")
    .description("探测指定能力")
    .option("--json", "JSON 输出格式")
    .action((name: string, options: InferOptions) => {
      const result = probeCapability(name);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(result.available ? `✓ 能力 ${name} 可用 (${result.latencyMs}ms)` : `✗ 能力 ${name} 不可用`);
      }
    });

  inferCmd
    .command("match <query>")
    .description("按关键词匹配能力")
    .option("--json", "JSON 输出格式")
    .action((query: string, options: InferOptions) => {
      const results = matchCapabilities(query);
      if (options.json) {
        logger.info(formatJsonOutput(results));
      } else {
        logger.info(`匹配 "${query}" (${results.length} 项):`);
        for (const c of results) {
          const icon = c.available ? "✓" : "✗";
          logger.info(`  ${icon} ${c.name} - ${c.description}`);
        }
      }
    });

  // 默认 capabilities
  inferCmd
    .option("--json", "JSON 输出格式")
    .action((options: InferOptions) => {
      const caps = getCapabilities();
      if (options.json) {
        logger.info(formatJsonOutput(caps));
      } else {
        const available = caps.filter((c) => c.available).length;
        logger.info(`能力: ${available}/${caps.length} 可用`);
      }
    });
}
