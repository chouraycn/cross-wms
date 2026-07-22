/**
 * CLI 主入口
 * 构建和运行 CLI 程序，挂载 skills 命令
 */

import { Command } from "commander";
import { registerSkillsCli } from "./skills-cli.js";

export function buildCliProgram(): Command {
  const program = new Command();
  program.name("cross-wms").description("Cross-WMS CLI");

  program
    .option("--no-color", "禁用颜色输出")
    .option("--json", "JSON 输出格式")
    .option("--quiet", "静默模式")
    .option("--verbose", "详细输出");

  registerSkillsCli(program);

  return program;
}

export async function runCli(argv: string[]): Promise<number> {
  try {
    const program = buildCliProgram();
    program.exitOverride((err) => {
      const exitCode = typeof err.exitCode === "number" ? err.exitCode : 1;
      throw new Error(`CLI exited with code ${exitCode}: ${err.message}`);
    });
    await program.parseAsync(["node", "cross-wms", ...argv]);
    return 0;
  } catch (error) {
    if (error instanceof Error && error.message.includes("CLI exited with code")) {
      const match = error.message.match(/code (\d+)/);
      return match ? parseInt(match[1], 10) : 1;
    }
    console.error("Error running CLI:", error instanceof Error ? error.message : String(error));
    return 1;
  }
}

export { registerSkillsCli } from "./skills-cli.js";
export {
  formatSkillsList,
  formatSkillInfo,
  formatSkillsCheck,
} from "./skills-cli.format.js";
export type {
  SkillStatusReport,
  SkillStatusEntry,
  SkillsListOptions,
  SkillInfoOptions,
  SkillsCheckOptions,
} from "./skills-cli.format.js";
