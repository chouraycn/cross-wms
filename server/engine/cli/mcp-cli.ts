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
      console.error('openclaw mcp list is not available in cross-wms');
      process.exit(1);
    });

  mcp
    .command("add")
    .description("Add an MCP server")
    .argument("<name>", "Server name")
    .action(() => {
      console.error('openclaw mcp add is not available in cross-wms');
      process.exit(1);
    });

  mcp
    .command("remove")
    .description("Remove an MCP server")
    .argument("<name>", "Server name")
    .action(() => {
      console.error('openclaw mcp remove is not available in cross-wms');
      process.exit(1);
    });

  mcp.action(() => {
    console.error('openclaw mcp is not available in cross-wms');
      process.exit(1);
  });
}
