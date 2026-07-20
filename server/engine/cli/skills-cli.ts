// Skills CLI registration for managing agent skills.
// 移植自 openclaw/src/cli/skills-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `../skills/*`、`./gateway-rpc.ts` 等。这里仅注册命令占位。
// `skills-cli.format.ts` 也一并降级。

import type { Command } from "commander";

/** Register the `skills` CLI command and subcommands. */
export function registerSkillsCli(program: Command): void {
  const skills = program.command("skills").description("Manage agent skills");

  skills
    .command("list")
    .description("List configured skills")
    .option("--json", "Output JSON", false)
    .action(() => {
      console.error('openclaw skills list is not available in cross-wms');
      process.exit(1);
    });

  skills
    .command("enable")
    .description("Enable a skill")
    .argument("<name>", "Skill name")
    .action(() => {
      console.error('openclaw skills enable is not available in cross-wms');
      process.exit(1);
    });

  skills
    .command("disable")
    .description("Disable a skill")
    .argument("<name>", "Skill name")
    .action(() => {
      console.error('openclaw skills disable is not available in cross-wms');
      process.exit(1);
    });

  skills.action(() => {
    console.error('openclaw skills is not available in cross-wms');
      process.exit(1);
  });
}
