// Commander registration for ACP bridge and interactive ACP client commands.
// 移植自 openclaw/src/cli/acp-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../acp/*`、
// `../runtime.js`、`./command-options.js`、`./gateway-secret-options.js`。
// 这些模块在 cross-wms 中尚未移植；这里仅注册命令占位，
// action 抛出 "not supported" 错误，保留函数签名。

import type { Command } from "commander";

/** Register the `acp` CLI command. */
export function registerAcpCli(program: Command): void {
  const acp = program.command("acp").description("Run an ACP bridge backed by the Gateway");

  acp
    .option("--url <url>", "Gateway WebSocket URL")
    .option("--token <token>", "Gateway token")
    .option("--token-file <path>", "Read gateway token from file")
    .option("--password <password>", "Gateway password")
    .option("--password-file <path>", "Read gateway password from file")
    .option("--session <key>", "Default session key")
    .option("--session-label <label>", "Default session label to resolve")
    .option("--require-existing", "Fail if the session key/label does not exist", false)
    .option("--reset-session", "Reset the session key before first use", false)
    .option("--no-prefix-cwd", "Do not prefix prompts with the working directory")
    .option("--provenance <mode>", "ACP provenance mode: off, meta, or meta+receipt")
    .option("-v, --verbose", "Verbose logging to stderr", false)
    .action(() => {
      console.error('openclaw acp is not available in cross-wms');
      process.exit(1);
    });
}
