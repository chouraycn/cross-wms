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
      console.error('openclaw devices list is not available in cross-wms');
      process.exit(1);
    });

  devices
    .command("remove")
    .description("Remove a paired device")
    .argument("<deviceId>", "Device id")
    .action(() => {
      console.error('openclaw devices remove is not available in cross-wms');
      process.exit(1);
    });

  devices.action(() => {
    console.error('openclaw devices is not available in cross-wms');
      process.exit(1);
  });
}
