/**
 * 设备配对 CLI。
 *
 * 参考 openclaw/src/cli/pairing-cli.ts 的命令形态与 server/routes/pairing.ts 的数据模型，
 * 实现一个自包含的设备配对管理 CLI：
 * - 配对设备 / 取消配对 / 列出已配对设备 / 查询配对状态
 * - 已配对设备持久化到 ~/.crosswms/paired-devices.json
 * - 类型定义与 server/engine/pairing/types.ts 保持一致（本地定义以避免跨包相对导入）
 *
 * 注意：本模块仅依赖 commander 与 Node 内置模块，不直接依赖 server 包。
 */
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ===================== 类型定义（与 server/engine/pairing/types.ts 对齐） =====================

/** 设备 ID */
export type DeviceId = string;

/** 配对方式 */
export type PairingMethod = 'qrcode' | 'manual-code' | 'network-discovery' | 'bluetooth';

/** 设备信息 */
export interface DeviceInfo {
  deviceId: DeviceId;
  deviceName: string;
  deviceType: string;
  osName?: string;
  osVersion?: string;
  appVersion?: string;
  capabilities?: string[];
  publicKey?: string;
  metadata?: Record<string, unknown>;
}

/** 已配对设备 */
export interface PairedDevice {
  deviceId: DeviceId;
  deviceInfo: DeviceInfo;
  pairedAt: number;
  lastSeenAt: number;
  isActive: boolean;
  trustLevel: number;
  sharedSecret?: string;
  metadata?: Record<string, unknown>;
}

/** 配对操作选项 */
export interface PairDeviceOptions {
  /** 设备名称 */
  deviceName?: string;
  /** 设备类型（mobile / tablet / desktop / ...） */
  deviceType?: string;
  /** 操作系统名称 */
  osName?: string;
  /** 操作系统版本 */
  osVersion?: string;
  /** 应用版本 */
  appVersion?: string;
  /** 设备能力列表 */
  capabilities?: string[];
  /** 配对方式，默认 manual-code */
  pairingMethod?: PairingMethod;
  /** 信任级别 0-100，默认 50 */
  trustLevel?: number;
  /** 是否标记为活跃，默认 true */
  isActive?: boolean;
}

/** 配对状态查询结果 */
export interface PairingStatus {
  deviceId: DeviceId;
  paired: boolean;
  active: boolean;
  pairedAt?: number;
  lastSeenAt?: number;
  trustLevel?: number;
  deviceInfo?: DeviceInfo;
}

// ===================== 持久化存储 =====================

/** 配置文件默认存放目录（~/.crosswms） */
function resolveConfigDir(): string {
  return process.env.CROSSWMS_STATE_DIR || path.join(os.homedir(), '.crosswms');
}

/** 解析已配对设备文件路径 */
export function resolvePairedDevicesPath(): string {
  return path.join(resolveConfigDir(), 'paired-devices.json');
}

/** 判断路径是否存在 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 读取全部已配对设备。
 * 文件不存在或解析失败时返回空数组。
 */
async function readPairedDevices(): Promise<PairedDevice[]> {
  const filePath = resolvePairedDevicesPath();
  if (!(await pathExists(filePath))) {
    return [];
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as { devices?: PairedDevice[] };
    if (parsed && Array.isArray(parsed.devices)) {
      return parsed.devices;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * 将已配对设备列表写回文件。
 * 自动创建父目录。
 */
async function writePairedDevices(devices: PairedDevice[]): Promise<void> {
  const filePath = resolvePairedDevicesPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify({ devices }, null, 2), 'utf-8');
}

// ===================== 核心操作函数 =====================

/**
 * 配对一个设备。
 *
 * 流程：
 *  1. 若该设备已配对，则更新其信息与最后活跃时间
 *  2. 否则创建新的 PairedDevice 记录并持久化
 *
 * 返回配对后的设备信息。
 */
export async function pairDevice(
  deviceId: string,
  options: PairDeviceOptions = {},
): Promise<PairedDevice> {
  if (!deviceId) {
    throw new Error('deviceId 不能为空');
  }

  const now = Date.now();
  const devices = await readPairedDevices();
  const existingIndex = devices.findIndex((d) => d.deviceId === deviceId);

  // 构造设备信息
  const deviceInfo: DeviceInfo = {
    deviceId,
    deviceName: options.deviceName ?? `device-${deviceId.slice(0, 8)}`,
    deviceType: options.deviceType ?? 'unknown',
    osName: options.osName,
    osVersion: options.osVersion,
    appVersion: options.appVersion,
    capabilities: options.capabilities,
  };

  if (existingIndex >= 0) {
    // 已存在：更新信息并刷新活跃时间
    const existing = devices[existingIndex];
    devices[existingIndex] = {
      ...existing,
      deviceInfo: { ...existing.deviceInfo, ...deviceInfo },
      lastSeenAt: now,
      isActive: options.isActive ?? true,
      trustLevel: options.trustLevel ?? existing.trustLevel,
    };
    await writePairedDevices(devices);
    return devices[existingIndex];
  }

  // 新设备
  const paired: PairedDevice = {
    deviceId,
    deviceInfo,
    pairedAt: now,
    lastSeenAt: now,
    isActive: options.isActive ?? true,
    trustLevel: options.trustLevel ?? 50,
    sharedSecret: randomUUID(),
  };
  devices.push(paired);
  await writePairedDevices(devices);
  return paired;
}

/**
 * 取消配对（移除已配对设备）。
 * 返回是否实际移除了设备。
 */
export async function unpairDevice(deviceId: string): Promise<boolean> {
  if (!deviceId) {
    throw new Error('deviceId 不能为空');
  }
  const devices = await readPairedDevices();
  const index = devices.findIndex((d) => d.deviceId === deviceId);
  if (index < 0) {
    return false;
  }
  devices.splice(index, 1);
  await writePairedDevices(devices);
  return true;
}

/**
 * 列出全部已配对设备。
 * 按配对时间倒序排列（最新配对的在前）。
 */
export async function listPairedDevices(): Promise<PairedDevice[]> {
  const devices = await readPairedDevices();
  return devices.sort((a, b) => b.pairedAt - a.pairedAt);
}

/**
 * 查询指定设备的配对状态。
 * 返回包含 paired / active 等字段的状态对象。
 */
export async function checkPairingStatus(deviceId: string): Promise<PairingStatus> {
  if (!deviceId) {
    throw new Error('deviceId 不能为空');
  }
  const devices = await readPairedDevices();
  const device = devices.find((d) => d.deviceId === deviceId);
  if (!device) {
    return { deviceId, paired: false, active: false };
  }
  return {
    deviceId,
    paired: true,
    active: device.isActive,
    pairedAt: device.pairedAt,
    lastSeenAt: device.lastSeenAt,
    trustLevel: device.trustLevel,
    deviceInfo: device.deviceInfo,
  };
}

// ===================== Commander 子命令 =====================

/** 格式化时间戳为可读字符串 */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

/**
 * Commander pairing 子命令注册。
 * 与 cross-wms 现有命令风格一致，导出一个 Command 实例。
 */
export const pairingCommand = new Command('pairing')
  .description('设备配对管理（pair / unpair / list / status）')
  .version('1.0.0');

// pair 子命令
pairingCommand
  .command('pair <deviceId>')
  .description('配对一个设备')
  .option('--name <deviceName>', '设备名称')
  .option('--type <deviceType>', '设备类型（mobile / tablet / desktop）')
  .option('--os <osName>', '操作系统名称')
  .option('--os-version <osVersion>', '操作系统版本')
  .option('--app-version <appVersion>', '应用版本')
  .option('--capabilities <capabilities>', '设备能力，逗号分隔')
  .option('--trust-level <trustLevel>', '信任级别 0-100', '50')
  .option('--inactive', '标记为非活跃', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(async (deviceId: string, opts: Record<string, string | boolean>) => {
    const trustLevel = Number.parseInt(opts['trust-level'] as string, 10) || 50;
    const capabilities = opts['capabilities']
      ? (opts['capabilities'] as string).split(',').map((c) => c.trim()).filter(Boolean)
      : undefined;

    const result = await pairDevice(deviceId, {
      deviceName: opts['name'] as string | undefined,
      deviceType: opts['type'] as string | undefined,
      osName: opts['os'] as string | undefined,
      osVersion: opts['os-version'] as string | undefined,
      appVersion: opts['app-version'] as string | undefined,
      capabilities,
      trustLevel,
      isActive: !opts['inactive'],
    });

    if (opts['json']) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`已配对设备: ${result.deviceInfo.deviceName} (${result.deviceId})`);
    console.log(`  类型: ${result.deviceInfo.deviceType}`);
    console.log(`  信任级别: ${result.trustLevel}`);
    console.log(`  活跃: ${result.isActive ? '是' : '否'}`);
    console.log(`  配对时间: ${formatTime(result.pairedAt)}`);
  });

// unpair 子命令
pairingCommand
  .command('unpair <deviceId>')
  .description('取消配对一个设备')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (deviceId: string, opts: { json: boolean }) => {
    const removed = await unpairDevice(deviceId);
    if (opts.json) {
      console.log(JSON.stringify({ deviceId, removed }));
      return;
    }
    if (removed) {
      console.log(`已取消配对: ${deviceId}`);
    } else {
      console.log(`未找到已配对设备: ${deviceId}`);
    }
  });

// list 子命令
pairingCommand
  .command('list')
  .description('列出全部已配对设备')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (opts: { json: boolean }) => {
    const devices = await listPairedDevices();
    if (opts.json) {
      console.log(JSON.stringify({ devices }, null, 2));
      return;
    }
    if (devices.length === 0) {
      console.log('暂无已配对设备');
      return;
    }
    console.log(`已配对设备（共 ${devices.length} 个）:`);
    console.log('');
    for (const device of devices) {
      const icon = device.isActive ? '●' : '○';
      console.log(`  ${icon} ${device.deviceId}: ${device.deviceInfo.deviceName}`);
      console.log(`    类型: ${device.deviceInfo.deviceType}`);
      console.log(`    状态: ${device.isActive ? '活跃' : '非活跃'}`);
      console.log(`    信任级别: ${device.trustLevel}`);
      console.log(`    配对时间: ${formatTime(device.pairedAt)}`);
      console.log(`    最后活跃: ${formatTime(device.lastSeenAt)}`);
      console.log('');
    }
  });

// status 子命令
pairingCommand
  .command('status <deviceId>')
  .description('查询指定设备的配对状态')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (deviceId: string, opts: { json: boolean }) => {
    const status = await checkPairingStatus(deviceId);
    if (opts.json) {
      console.log(JSON.stringify(status, null, 2));
      return;
    }
    if (!status.paired) {
      console.log(`设备 ${deviceId} 未配对`);
      return;
    }
    console.log(`设备 ${deviceId} 配对状态:`);
    console.log(`  已配对: 是`);
    console.log(`  活跃: ${status.active ? '是' : '否'}`);
    if (status.pairedAt) {
      console.log(`  配对时间: ${formatTime(status.pairedAt)}`);
    }
    if (status.lastSeenAt) {
      console.log(`  最后活跃: ${formatTime(status.lastSeenAt)}`);
    }
    if (status.trustLevel !== undefined) {
      console.log(`  信任级别: ${status.trustLevel}`);
    }
    if (status.deviceInfo) {
      console.log(`  设备名称: ${status.deviceInfo.deviceName}`);
      console.log(`  设备类型: ${status.deviceInfo.deviceType}`);
    }
  });
