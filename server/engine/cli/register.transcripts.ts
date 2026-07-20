// registerTranscriptsCli: CLI command registration ported from openclaw.
// 移植自 openclaw/src/cli/program/register.transcripts.ts
//
// 降级策略：
//  - 原模块依赖 OpenClaw 内部模块（terminal-core, runtime, cli-utils 等）。
//    cross-wms 未移植；此处注册命令结构，action 输出 "not available in cross-wms"。

import type { Command } from "commander";

function notAvailable(name: string): () => void {
  return () => {
    console.error(`${name} is not available in cross-wms`);
    process.exit(1);
  };
}

/** Register the transcripts command(s). */
export function registerTranscriptsCli(program: Command): void {
  program
    .command("transcripts")
    .description("Inspect stored transcripts")
    .action(notAvailable("transcripts"));
  program
    .command("list")
    .description("List stored transcript sessions")
    .action(notAvailable("list"));
  program
    .command("show")
    .description("Print a transcript summary markdown file")
    .action(notAvailable("show"));
  program
    .command("path")
    .description("Print a stored transcripts artifact path")
    .action(notAvailable("path"));
}
