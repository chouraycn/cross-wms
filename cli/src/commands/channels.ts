/**
 * 通道（channel）管理 CLI。
 *
 * 参考 openclaw/src/cli/channels-cli.ts 的命令形态（list / status / add / remove / login / logout），
 * 在 cross-wms CLI 中提供通道注册、启用、停用、安装、卸载等本地管理能力。
 * 数据持久化到 ~/.crosswms/channels.json。
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ===================== 类型定义 =====================

/** 通道状态 */
export type ChannelStatus = 'enabled' | 'disabled' | 'installing' | 'error';

/** 通道元数据 */
export interface ChannelMeta {
  id: string;
  name: string;
  description: string;
  version: string;
  source: 'bundled' | 'installable' | 'configured';
  capabilities: string[];
  /** 通道安装/运行所需的依赖提示（供 UI 展示） */
  requirements?: string[];
}

/** 已配置的通道实例 */
export interface ChannelConfig {
  id: string;
  accountId: string;
  status: ChannelStatus;
  enabled: boolean;
  configuredAt: number;
  lastError?: string;
  options?: Record<string, string>;
}

/** 持久化文件 */
interface ChannelsFile {
  configs: ChannelConfig[];
  installedIds: string[];
}

// ===================== 内置通道目录（bundled） =====================

const BUNDLED_CHANNELS: ChannelMeta[] = [
  {
    id: 'feishu',
    name: '飞书',
    description: '飞书/Lark 通道（支持消息收发、群聊、卡片）',
    version: '1.0.0',
    source: 'bundled',
    capabilities: ['send', 'receive', 'group', 'card'],
    requirements: ['飞书应用 AppID / AppSecret'],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Slack 工作区通道',
    version: '1.0.0',
    source: 'bundled',
    capabilities: ['send', 'receive', 'thread'],
    requirements: ['Slack Bot Token / Signing Secret'],
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Discord 频道与私信',
    version: '1.0.0',
    source: 'bundled',
    capabilities: ['send', 'receive', 'dm'],
    requirements: ['Discord Bot Token'],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    description: 'Telegram Bot 通道',
    version: '1.0.0',
    source: 'bundled',
    capabilities: ['send', 'receive', 'inline'],
    requirements: ['Telegram Bot Token'],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'OpenAI 兼容通道（API 转发）',
    version: '1.0.0',
    source: 'bundled',
    capabilities: ['chat', 'completion'],
    requirements: ['OPENAI_API_KEY'],
  },
  {
    id: 'webhook',
    name: 'Webhook',
    description: '通用 Webhook 出站通道',
    version: '1.0.0',
    source: 'bundled',
    capabilities: ['send'],
    requirements: ['目标 URL'],
  },
];

const INSTALLABLE_CATALOG: ChannelMeta[] = [
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    description: 'WhatsApp Web 通道（扫码登录）',
    version: '1.0.0',
    source: 'installable',
    capabilities: ['send', 'receive'],
    requirements: ['WhatsApp 账号'],
  },
  {
    id: 'matrix',
    name: 'Matrix',
    description: 'Matrix 协议通道',
    version: '1.0.0',
    source: 'installable',
    capabilities: ['send', 'receive', 'room'],
    requirements: ['Homeserver URL + Token'],
  },
  {
    id: 'irc',
    name: 'IRC',
    description: 'IRC 通道',
    version: '1.0.0',
    source: 'installable',
    capabilities: ['send', 'receive'],
    requirements: ['IRC 服务器/端口/昵称'],
  },
];

// ===================== 持久化 =====================

function resolveStateDir(): string {
  return process.env.CROSSWMS_STATE_DIR || path.join(os.homedir(), '.crosswms');
}

function resolveChannelsPath(): string {
  return path.join(resolveStateDir(), 'channels.json');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readChannelsFile(): Promise<ChannelsFile> {
  const filePath = resolveChannelsPath();
  if (!(await pathExists(filePath))) {
    return { configs: [], installedIds: [] };
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<ChannelsFile>;
    return {
      configs: Array.isArray(parsed.configs) ? parsed.configs : [],
      installedIds: Array.isArray(parsed.installedIds) ? parsed.installedIds : [],
    };
  } catch {
    return { configs: [], installedIds: [] };
  }
}

async function writeChannelsFile(file: ChannelsFile): Promise<void> {
  const filePath = resolveChannelsPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(file, null, 2), 'utf-8');
}

// ===================== 核心操作函数 =====================

/** 列出所有可用通道元数据（按 --all 决定是否含 installable 目录） */
export function listChannelCatalog(includeAll: boolean): ChannelMeta[] {
  const all = [...BUNDLED_CHANNELS];
  if (includeAll) all.push(...INSTALLABLE_CATALOG);
  return all;
}

/** 列出已配置的通道（按 channelId 分组） */
export async function listConfiguredChannels(): Promise<ChannelConfig[]> {
  const file = await readChannelsFile();
  return file.configs;
}

/** 查询通道元数据（bundled + installable） */
export function getChannelMeta(channelId: string): ChannelMeta | undefined {
  return listChannelCatalog(true).find((c) => c.id === channelId);
}

/** 安装一个通道（仅 installable 目录中的可执行 install） */
export async function installChannel(channelId: string): Promise<{ id: string; installed: boolean }> {
  const meta = getChannelMeta(channelId);
  if (!meta) {
    throw new Error(`未知通道: ${channelId}`);
  }
  if (meta.source === 'bundled') {
    // bundled 通道已默认安装
    return { id: channelId, installed: true };
  }
  const file = await readChannelsFile();
  if (!file.installedIds.includes(channelId)) {
    file.installedIds.push(channelId);
    await writeChannelsFile(file);
  }
  return { id: channelId, installed: true };
}

/** 卸载一个通道（仅 installable 通道） */
export async function uninstallChannel(channelId: string): Promise<{ id: string; removed: boolean }> {
  const meta = getChannelMeta(channelId);
  if (!meta) {
    throw new Error(`未知通道: ${channelId}`);
  }
  if (meta.source === 'bundled') {
    throw new Error('bundled 通道无法卸载');
  }
  const file = await readChannelsFile();
  file.installedIds = file.installedIds.filter((id) => id !== channelId);
  // 同步移除相关配置
  file.configs = file.configs.filter((c) => c.id !== channelId);
  await writeChannelsFile(file);
  return { id: channelId, removed: true };
}

/** 启用通道 */
export async function enableChannel(
  channelId: string,
  accountId = 'default',
  options: Record<string, string> = {},
): Promise<ChannelConfig> {
  const meta = getChannelMeta(channelId);
  if (!meta) {
    throw new Error(`未知通道: ${channelId}`);
  }
  const file = await readChannelsFile();
  const idx = file.configs.findIndex((c) => c.id === channelId && c.accountId === accountId);
  const now = Date.now();
  if (idx >= 0) {
    file.configs[idx] = {
      ...file.configs[idx],
      enabled: true,
      status: 'enabled',
      lastError: undefined,
      options: { ...file.configs[idx].options, ...options },
    };
    await writeChannelsFile(file);
    return file.configs[idx];
  }
  const config: ChannelConfig = {
    id: channelId,
    accountId,
    status: 'enabled',
    enabled: true,
    configuredAt: now,
    options,
  };
  file.configs.push(config);
  await writeChannelsFile(file);
  return config;
}

/** 停用通道 */
export async function disableChannel(
  channelId: string,
  accountId = 'default',
): Promise<ChannelConfig | undefined> {
  const file = await readChannelsFile();
  const idx = file.configs.findIndex((c) => c.id === channelId && c.accountId === accountId);
  if (idx < 0) return undefined;
  file.configs[idx] = {
    ...file.configs[idx],
    enabled: false,
    status: 'disabled',
  };
  await writeChannelsFile(file);
  return file.configs[idx];
}

/** 探测通道状态（仅模拟：检查配置完整性） */
export async function probeChannel(
  channelId: string,
  accountId = 'default',
): Promise<{ id: string; accountId: string; reachable: boolean; details: string }> {
  const file = await readChannelsFile();
  const config = file.configs.find((c) => c.id === channelId && c.accountId === accountId);
  if (!config) {
    return { id: channelId, accountId, reachable: false, details: '未配置' };
  }
  // 模拟：根据 options 是否包含 token/key 来判断是否"可达"
  const hasCreds = Boolean(config.options && Object.values(config.options).some((v) => v));
  return {
    id: channelId,
    accountId,
    reachable: hasCreds,
    details: hasCreds ? '凭据已配置' : '缺少凭据',
  };
}

// ===================== Commander 子命令 =====================

export const channelsCommand = new Command('channels')
  .description('通道管理（list / status / install / uninstall / enable / disable）')
  .version('1.0.0');

// list 子命令
channelsCommand
  .command('list')
  .description('列出通道（默认仅显示 bundled，加 --all 显示完整目录）')
  .option('--all', '包含 bundled 与 installable 目录', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(async (opts: { all: boolean; json: boolean }) => {
    const catalog = listChannelCatalog(opts.all);
    if (opts.json) {
      console.log(JSON.stringify({ channels: catalog }, null, 2));
      return;
    }
    console.log(`通道目录（共 ${catalog.length} 个）:`);
    console.log('');
    for (const c of catalog) {
      const tag = c.source === 'bundled' ? '[内置]' : '[可安装]';
      console.log(`  ${c.id}: ${c.name} ${tag}`);
      console.log(`    描述: ${c.description}`);
      console.log(`    版本: ${c.version}`);
      console.log(`    能力: ${c.capabilities.join(', ')}`);
      if (c.requirements?.length) {
        console.log(`    依赖: ${c.requirements.join(', ')}`);
      }
      console.log('');
    }
  });

// status 子命令
channelsCommand
  .command('status')
  .description('查看已配置通道的运行状态')
  .option('-c, --channel <channelId>', '仅显示指定通道')
  .option('--probe', '探测通道连通性', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (opts: { channel?: string; probe: boolean; json: boolean }) => {
      const configs = await listConfiguredChannels();
      const filtered = opts.channel
        ? configs.filter((c) => c.id === opts.channel)
        : configs;
      const rows = await Promise.all(
        filtered.map(async (c) => {
          if (opts.probe) {
            const r = await probeChannel(c.id, c.accountId);
            return { ...c, probe: r };
          }
          return c;
        }),
      );
      if (opts.json) {
        console.log(JSON.stringify({ channels: rows }, null, 2));
        return;
      }
      if (rows.length === 0) {
        console.log('暂无已配置通道');
        return;
      }
      console.log(`已配置通道（共 ${rows.length} 个）:`);
      console.log('');
      for (const c of rows) {
        const status = c.enabled ? '✓ 启用' : '✗ 禁用';
        console.log(`  ${c.id} (${c.accountId}): ${status}`);
        console.log(`    状态: ${c.status}`);
        console.log(`    配置时间: ${new Date(c.configuredAt).toLocaleString()}`);
        if (c.lastError) {
          console.log(`    最近错误: ${c.lastError}`);
        }
        if ('probe' in c && c.probe) {
          console.log(`    探测: ${c.probe.reachable ? '✓' : '✗'} ${c.probe.details}`);
        }
        console.log('');
      }
    },
  );

// install 子命令
channelsCommand
  .command('install <channelId>')
  .description('安装一个通道（bundled 通道默认已安装）')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (channelId: string, opts: { json: boolean }) => {
    const result = await installChannel(channelId);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`通道 ${channelId} 已安装`);
  });

// uninstall 子命令
channelsCommand
  .command('uninstall <channelId>')
  .description('卸载一个通道（仅 installable 通道）')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (channelId: string, opts: { json: boolean }) => {
    const result = await uninstallChannel(channelId);
    if (opts.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    console.log(`通道 ${channelId} 已卸载`);
  });

// enable 子命令
channelsCommand
  .command('enable <channelId>')
  .description('启用一个通道')
  .option('-a, --account <accountId>', '账号 ID', 'default')
  .option('--token <token>', '配置 token（写入 options.token）')
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (
      channelId: string,
      opts: { account: string; token?: string; json: boolean },
    ) => {
      const options: Record<string, string> = {};
      if (opts.token) options['token'] = opts.token;
      const config = await enableChannel(channelId, opts.account, options);
      if (opts.json) {
        console.log(JSON.stringify(config, null, 2));
        return;
      }
      console.log(`通道 ${channelId} (账号 ${config.accountId}) 已启用`);
    },
  );

// disable 子命令
channelsCommand
  .command('disable <channelId>')
  .description('停用一个通道')
  .option('-a, --account <accountId>', '账号 ID', 'default')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (channelId: string, opts: { account: string; json: boolean }) => {
    const config = await disableChannel(channelId, opts.account);
    if (opts.json) {
      console.log(JSON.stringify({ id: channelId, accountId: opts.account, disabled: Boolean(config) }, null, 2));
      return;
    }
    if (config) {
      console.log(`通道 ${channelId} (账号 ${opts.account}) 已停用`);
    } else {
      console.log(`未找到通道 ${channelId} (账号 ${opts.account}) 的配置`);
    }
  });
