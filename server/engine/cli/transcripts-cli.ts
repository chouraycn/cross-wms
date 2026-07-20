// Transcripts CLI registration: view and export conversation transcripts.
// 移植自 openclaw/src/cli/program/transcripts-cli.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

function notAvailable(name: string): () => void {
  return () => {
    console.error(`${name} is not available in cross-wms`);
    process.exit(1);
  };
}

/** Register the `transcripts` CLI command and subcommands. */
export function registerTranscriptsCli(program: Command): void {
  const transcripts = program
    .command("transcripts")
    .description("View and export conversation transcripts");

  transcripts
    .command("list")
    .description("List transcripts")
    .option("--limit <n>", "Max transcripts to list", "20")
    .option("--json", "Output JSON", false)
    .action(notAvailable("transcripts list"));

  transcripts
    .command("show")
    .description("Show a transcript")
    .argument("<id>", "Transcript ID")
    .option("--json", "Output JSON", false)
    .action(notAvailable("transcripts show"));

  transcripts
    .command("export")
    .description("Export a transcript")
    .argument("<id>", "Transcript ID")
    .option("--format <fmt>", "Export format: json|markdown", "json")
    .action(notAvailable("transcripts export"));

  transcripts
    .command("delete")
    .description("Delete a transcript")
    .argument("<id>", "Transcript ID")
    .action(notAvailable("transcripts delete"));
}
