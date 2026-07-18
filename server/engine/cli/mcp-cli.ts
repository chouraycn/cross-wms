// MCP CLI registration for Model Context Protocol server management.
// 移植自 openclaw/src/cli/mcp-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `../mcp/*`、`./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `mcp` CLI command and subcommands. */
export function registerMcpCli(program: Command): void {
  const mcp = program.command("mcp").description("Manage MCP (Model Context Protocol) servers");

  mcp
    .command("list")
    .description("List configured MCP servers")
    .option("--json", "Output JSON", false)
    .action(() => {
      throw new Error(
        "openclaw mcp list: not supported in stub mode (mcp/*, runtime not ported).",
      );
    });

  mcp
    .command("add")
    .description("Add an MCP server")
    .argument("<name>", "Server name")
    .action(() => {
      throw new Error(
        "openclaw mcp add: not supported in stub mode (mcp/*, runtime not ported).",
      );
    });

  mcp
    .command("remove")
    .description("Remove an MCP server")
    .argument("<name>", "Server name")
    .action(() => {
      throw new Error(
        "openclaw mcp remove: not supported in stub mode (mcp/*, runtime not ported).",
      );
    });

  mcp.action(() => {
    throw new Error(
      "openclaw mcp: not supported in stub mode (mcp/*, runtime not ported).",
    );
  });
}
