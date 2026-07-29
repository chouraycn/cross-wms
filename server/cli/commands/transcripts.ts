/**
 * transcripts 命令
 * 转录查看 (list/show/export)
 *
 * 参考 openclaw transcripts-cli，查看会话转录记录。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type TranscriptsOptions = {
  json?: boolean;
  limit?: string;
};

interface TranscriptEntry {
  id: string;
  sessionId: string;
  agentId: string;
  status: "completed" | "partial" | "failed";
  durationSec: number;
  turnCount: number;
  createdAt: string;
  summary: string;
}

const TRANSCRIPT_STORE: Map<string, TranscriptEntry> = new Map([
  [
    "tr-001",
    {
      id: "tr-001",
      sessionId: "sess-abc",
      agentId: "wms-expert",
      status: "completed",
      durationSec: 320,
      turnCount: 12,
      createdAt: "2025-01-15T09:00:00Z",
      summary: "讨论了库存补货策略并生成了补货建议",
    },
  ],
  [
    "tr-002",
    {
      id: "tr-002",
      sessionId: "sess-def",
      agentId: "wms-analyst",
      status: "partial",
      durationSec: 180,
      turnCount: 6,
      createdAt: "2025-01-15T10:30:00Z",
      summary: "分析了出库异常数据（未完成）",
    },
  ],
]);

function listTranscripts(): TranscriptEntry[] {
  return Array.from(TRANSCRIPT_STORE.values()).sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );
}

function getTranscript(id: string): TranscriptEntry | undefined {
  return TRANSCRIPT_STORE.get(id);
}

function formatJsonOutput(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

function formatTranscriptList(transcripts: TranscriptEntry[]): string {
  if (transcripts.length === 0) {
    return "  无转录记录";
  }
  const lines: string[] = ["", "  转录列表:"];
  for (const t of transcripts) {
    const icon = t.status === "completed" ? "✓" : t.status === "failed" ? "✗" : "~";
    lines.push(`    ${icon} ${t.id} [${t.sessionId}] ${t.agentId} (${t.turnCount} 轮, ${t.durationSec}s)`);
    lines.push(`        ${t.summary}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function registerTranscriptsCommand(program: Command): void {
  const transcriptsCmd = program
    .command("transcripts")
    .description("转录查看 (list/show/export)")
    .alias("tr");

  transcriptsCmd
    .command("list")
    .description("列出转录记录")
    .option("--limit <n>", "显示条数", "50")
    .option("--json", "JSON 输出格式")
    .action((options: TranscriptsOptions) => {
      const transcripts = listTranscripts();
      const limit = options.limit ? parseInt(options.limit, 10) : 50;
      const limited = transcripts.slice(0, limit);
      if (options.json) {
        logger.info(formatJsonOutput(limited));
      } else {
        logger.info(formatTranscriptList(limited));
      }
    });

  transcriptsCmd
    .command("show <id>")
    .description("查看转录详情")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: TranscriptsOptions) => {
      const transcript = getTranscript(id);
      if (!transcript) {
        logger.error(`未找到转录: ${id}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(transcript));
      } else {
        logger.info("");
        logger.info(`  转录详情: ${transcript.id}`);
        logger.info(`    会话:   ${transcript.sessionId}`);
        logger.info(`    代理:   ${transcript.agentId}`);
        logger.info(`    状态:   ${transcript.status}`);
        logger.info(`    时长:   ${transcript.durationSec}s`);
        logger.info(`    轮次:   ${transcript.turnCount}`);
        logger.info(`    摘要:   ${transcript.summary}`);
        logger.info("");
      }
    });

  transcriptsCmd
    .command("export <id>")
    .description("导出转录为文本")
    .action((id: string) => {
      const transcript = getTranscript(id);
      if (!transcript) {
        logger.error(`未找到转录: ${id}`);
        return;
      }
      logger.info(`# 转录 ${transcript.id}`);
      logger.info(`会话: ${transcript.sessionId}  代理: ${transcript.agentId}`);
      logger.info(`状态: ${transcript.status}  时长: ${transcript.durationSec}s  轮次: ${transcript.turnCount}`);
      logger.info("");
      logger.info(`摘要: ${transcript.summary}`);
    });

  // 默认 list
  transcriptsCmd
    .option("--json", "JSON 输出格式")
    .action((options: TranscriptsOptions) => {
      const transcripts = listTranscripts();
      if (options.json) {
        logger.info(formatJsonOutput(transcripts));
      } else {
        logger.info(formatTranscriptList(transcripts));
      }
    });
}
