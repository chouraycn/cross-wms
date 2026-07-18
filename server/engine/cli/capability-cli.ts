// Capability CLI commands for local/gateway model, media, memory, search, and generation calls.
// 移植自 openclaw/src/cli/capability-cli.ts。
//
// 降级策略：原模块依赖大量未移植模块：`@openclaw/media-core/mime`、
// `@openclaw/normalization-core/string-coerce`、
// `../../packages/gateway-protocol/src/client-info.js`、
// `../../packages/terminal-core/src/*`、`../agents/*`、`../auto-reply/*`、
// `../config/*`、`../gateway/call.js`、`../runtime.js` 等。
// 这里仅注册命令占位，action 抛出 "not supported" 错误。

import type { Command } from "commander";

/** Register the `capability` CLI command and subcommands. */
export function registerCapabilityCli(program: Command): void {
  const capability = program
    .command("capability")
    .description("Local/gateway model, media, memory, search, and generation calls");

  capability
    .command("model")
    .description("Run a model completion")
    .option("--agent <id>", "Agent id")
    .option("--json", "Output JSON", false)
    .argument("<prompt>", "Prompt text")
    .action(() => {
      throw new Error(
        "openclaw capability model: not supported in stub mode (agents/* not ported).",
      );
    });

  capability
    .command("image")
    .description("Generate an image")
    .option("--agent <id>", "Agent id")
    .option("--json", "Output JSON", false)
    .argument("<prompt>", "Prompt text")
    .action(() => {
      throw new Error(
        "openclaw capability image: not supported in stub mode (agents/* not ported).",
      );
    });

  capability
    .command("memory")
    .description("Search agent memory")
    .option("--agent <id>", "Agent id")
    .option("--json", "Output JSON", false)
    .argument("<query>", "Search query")
    .action(() => {
      throw new Error(
        "openclaw capability memory: not supported in stub mode (agents/* not ported).",
      );
    });

  capability
    .command("search")
    .description("Run a web search")
    .option("--agent <id>", "Agent id")
    .option("--json", "Output JSON", false)
    .argument("<query>", "Search query")
    .action(() => {
      throw new Error(
        "openclaw capability search: not supported in stub mode (agents/* not ported).",
      );
    });

  capability.action(() => {
    throw new Error(
      "openclaw capability: not supported in stub mode (agents/* not ported).",
    );
  });
}
