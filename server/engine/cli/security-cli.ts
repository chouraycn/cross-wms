// Security CLI registration for security audits and policy management.
// 移植自 openclaw/src/cli/security-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `../security/*`、`./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `security` CLI command and subcommands. */
export function registerSecurityCli(program: Command): void {
  const security = program.command("security").description("Security audits and policy management");

  security
    .command("audit")
    .description("Run a security audit")
    .option("--json", "Output JSON", false)
    .action(() => {
      throw new Error(
        "openclaw security audit: not supported in stub mode (security/*, runtime not ported).",
      );
    });

  security.action(() => {
    throw new Error(
      "openclaw security: not supported in stub mode (security/*, runtime not ported).",
    );
  });
}
