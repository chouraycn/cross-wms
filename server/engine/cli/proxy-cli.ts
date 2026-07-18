// Proxy CLI registration for running a local network proxy.
// 移植自 openclaw/src/cli/proxy-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `./proxy-cli.runtime.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `proxy` CLI command. */
export function registerProxyCli(program: Command): void {
  const proxy = program.command("proxy").description("Run a local network proxy");

  proxy
    .option("--port <n>", "Proxy port")
    .option("--upstream <url>", "Upstream URL")
    .option("--json", "Output JSON", false)
    .action(() => {
      throw new Error(
        "openclaw proxy: not supported in stub mode (runtime, proxy-cli.runtime not ported).",
      );
    });
}
