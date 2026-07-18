// Devices CLI registration for managing paired devices.
// 移植自 openclaw/src/cli/devices-cli.ts。
//
// 降级策略：原模块依赖 `../../packages/terminal-core/src/*`、`../runtime.js`、
// `./devices-cli.runtime.ts`、`./gateway-rpc.ts` 等。这里仅注册命令占位。

import type { Command } from "commander";

/** Register the `devices` CLI command and subcommands. */
export function registerDevicesCli(program: Command): void {
  const devices = program.command("devices").description("Manage paired devices");

  devices
    .command("list")
    .description("List paired devices")
    .option("--json", "Output JSON", false)
    .action(() => {
      throw new Error(
        "openclaw devices list: not supported in stub mode (runtime, gateway-rpc not ported).",
      );
    });

  devices
    .command("remove")
    .description("Remove a paired device")
    .argument("<deviceId>", "Device id")
    .action(() => {
      throw new Error(
        "openclaw devices remove: not supported in stub mode (runtime, gateway-rpc not ported).",
      );
    });

  devices.action(() => {
    throw new Error(
      "openclaw devices: not supported in stub mode (runtime, gateway-rpc not ported).",
    );
  });
}
