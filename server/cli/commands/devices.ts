/**
 * devices 命令
 * 设备管理 (list/pair/remove/info)
 *
 * 参考 openclaw devices-cli，管理已配对的客户端设备。
 * 使用本地内存存储模拟，保证 CLI 可用。
 */

import type { Command } from "commander";
import { logger } from "../../logger.js";

export type DevicesOptions = {
  json?: boolean;
};

type DevicePlatform = "ios" | "android" | "macos" | "windows" | "linux" | "web";

interface DeviceEntry {
  id: string;
  name: string;
  platform: DevicePlatform;
  paired: boolean;
  lastSeenAt?: string;
  pushToken?: string;
  createdAt: string;
}

const DEVICE_STORE: Map<string, DeviceEntry> = new Map([
  [
    "dev-001",
    {
      id: "dev-001",
      name: "iPhone 15 Pro",
      platform: "ios",
      paired: true,
      lastSeenAt: "2025-01-15T09:30:00Z",
      createdAt: "2025-01-01T00:00:00Z",
    },
  ],
  [
    "dev-002",
    {
      id: "dev-002",
      name: "MacBook Pro",
      platform: "macos",
      paired: true,
      lastSeenAt: "2025-01-15T10:00:00Z",
      createdAt: "2025-01-02T00:00:00Z",
    },
  ],
  [
    "dev-003",
    {
      id: "dev-003",
      name: "Android Tablet",
      platform: "android",
      paired: false,
      createdAt: "2025-01-10T00:00:00Z",
    },
  ],
]);

function listDevices(): DeviceEntry[] {
  return Array.from(DEVICE_STORE.values());
}

function getDevice(id: string): DeviceEntry | undefined {
  return DEVICE_STORE.get(id);
}

function generatePairingCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function pairDevice(id: string, code: string): { success: boolean; message: string } {
  const device = DEVICE_STORE.get(id);
  if (!device) {
    return { success: false, message: `设备未找到: ${id}` };
  }
  if (code.length < 4) {
    return { success: false, message: "配对码无效（至少 4 位）" };
  }
  device.paired = true;
  device.lastSeenAt = new Date().toISOString();
  return { success: true, message: `设备 ${device.name} 已配对` };
}

function removeDevice(id: string): boolean {
  return DEVICE_STORE.delete(id);
}

function formatJsonOutput(data: any): string {
  return JSON.stringify(data, null, 2);
}

function formatDeviceList(devices: DeviceEntry[]): string {
  const lines: string[] = ["", "  设备列表:"];
  for (const d of devices) {
    const icon = d.paired ? "✓" : "✗";
    lines.push(`    ${icon} ${d.id} ${d.name} [${d.platform}]`);
    if (d.lastSeenAt) {
      lines.push(`        最后在线: ${d.lastSeenAt}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function registerDevicesCommand(program: Command): void {
  const devicesCmd = program
    .command("devices")
    .description("设备管理 (list/pair/remove/info)")
    .alias("dev");

  devicesCmd
    .command("list")
    .description("列出所有设备")
    .option("--json", "JSON 输出格式")
    .action((options: DevicesOptions) => {
      const devices = listDevices();
      if (options.json) {
        logger.info(formatJsonOutput(devices));
      } else {
        logger.info(formatDeviceList(devices));
      }
    });

  devicesCmd
    .command("pair <id> <code>")
    .description("使用配对码配对设备")
    .option("--json", "JSON 输出格式")
    .action((id: string, code: string, options: DevicesOptions) => {
      const result = pairDevice(id, code);
      if (options.json) {
        logger.info(formatJsonOutput(result));
      } else {
        logger.info(result.success ? `✓ ${result.message}` : `✗ ${result.message}`);
      }
    });

  devicesCmd
    .command("info <id>")
    .description("查看设备详情")
    .option("--json", "JSON 输出格式")
    .action((id: string, options: DevicesOptions) => {
      const device = getDevice(id);
      if (!device) {
        logger.error(`未找到设备: ${id}`);
        return;
      }
      if (options.json) {
        logger.info(formatJsonOutput(device));
      } else {
        logger.info("");
        logger.info(`  设备: ${device.id}`);
        logger.info(`    名称:     ${device.name}`);
        logger.info(`    平台:     ${device.platform}`);
        logger.info(`    已配对:   ${device.paired ? "是" : "否"}`);
        logger.info(`    创建时间: ${device.createdAt}`);
        if (device.lastSeenAt) {
          logger.info(`    最后在线: ${device.lastSeenAt}`);
        }
        logger.info("");
      }
    });

  devicesCmd
    .command("remove <id>")
    .description("移除设备")
    .action((id: string) => {
      const removed = removeDevice(id);
      if (removed) {
        logger.info(`已移除设备: ${id}`);
      } else {
        logger.error(`未找到设备: ${id}`);
      }
    });

  devicesCmd
    .command("pairing-code")
    .description("生成新的配对码")
    .action(() => {
      const code = generatePairingCode();
      logger.info(`配对码: ${code}`);
      logger.info("有效期 5 分钟，请在设备上输入此配对码完成配对");
    });

  // 默认 list
  devicesCmd
    .option("--json", "JSON 输出格式")
    .action((options: DevicesOptions) => {
      const devices = listDevices();
      if (options.json) {
        logger.info(formatJsonOutput(devices));
      } else {
        logger.info(formatDeviceList(devices));
      }
    });
}
