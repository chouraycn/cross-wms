// Commander registration for model catalog, status, auth, alias, and fallback commands.
// 移植自 openclaw/src/cli/models-cli.ts。
//
// 降级策略：
//  - 原模块依赖 `../../packages/terminal-core/src/*`（links/theme）、
//    `../commands/models/*`（大量子命令实现）、`./models-cli.runtime.js`、
//    `./cli-utils.js`。其中 `commands/models/*` 与 `terminal-core/*` 在 cross-wms 中
//    尚未移植；这里仅保留 `registerModelsCli` 函数签名并注册 `models` 命令占位，
//    action 抛出 "not supported" 错误，保留函数签名以便未来替换为正式实现。

import type { Command } from "commander";

/**
 * Register the `models` CLI command and its subcommands.
 *
 * 降级实现：openclaw 的 `commands/models/*` 与 `terminal-core/*` 未移植；
 * 这里仅注册命令占位，action 抛出 "not supported" 错误。
 */
export function registerModelsCli(program: Command): void {
  const models = program
    .command("models")
    .description("Model discovery, scanning, and configuration")
    .option("--status-json", "Output JSON (alias for `models status --json`)", false)
    .option("--status-plain", "Plain output (alias for `models status --plain`)", false)
    .option("--agent <id>", "Agent id to inspect (overrides OPENCLAW_AGENT_DIR)");

  models
    .command("list")
    .description("List models (configured by default)")
    .option("--all", "Show full model catalog", false)
    .option("--local", "Filter to local models", false)
    .option("--provider <id>", "Filter by provider id")
    .option("--json", "Output JSON", false)
    .option("--plain", "Plain line output", false)
    .action(() => {
      throw new Error(
        "openclaw models list: not supported in stub mode (commands/models/* not ported).",
      );
    });

  models
    .command("status")
    .description("Show configured model state")
    .option("--json", "Output JSON", false)
    .option("--plain", "Plain output", false)
    .action(() => {
      throw new Error(
        "openclaw models status: not supported in stub mode (commands/models/* not ported).",
      );
    });

  models
    .command("set")
    .description("Set the default model")
    .argument("<model>", "Model id or alias")
    .action(() => {
      throw new Error(
        "openclaw models set: not supported in stub mode (commands/models/* not ported).",
      );
    });

  models
    .command("set-image")
    .description("Set the image model")
    .argument("<model>", "Model id or alias")
    .action(() => {
      throw new Error(
        "openclaw models set-image: not supported in stub mode (commands/models/* not ported).",
      );
    });

  models.command("aliases").description("Manage model aliases");
  models.command("fallbacks").description("Manage model fallback list");
  models.command("image-fallbacks").description("Manage image model fallback list");

  models
    .command("scan")
    .description("Scan OpenRouter free models for tools + images")
    .action(() => {
      throw new Error(
        "openclaw models scan: not supported in stub mode (commands/models/* not ported).",
      );
    });

  models.action(() => {
    throw new Error(
      "openclaw models: not supported in stub mode (commands/models/* not ported).",
    );
  });

  const auth = models.command("auth").description("Manage model auth profiles");
  auth.option("--agent <id>", "Agent id for auth commands");
  auth.action(() => {
    auth.help();
  });
}
