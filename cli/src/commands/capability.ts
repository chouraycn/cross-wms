/**
 * 能力（capability）声明管理 CLI。
 *
 * 参考 openclaw/src/cli/capability-cli.ts 的命令形态（list / inspect），
 * 在 cross-wms CLI 中提供本机能力声明的查看与元数据维护。
 * 数据持久化到 ~/.crosswms/capabilities.json。
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ===================== 类型定义 =====================

/** 能力传输方式 */
export type CapabilityTransport = 'local' | 'gateway';

/** 能力元数据 */
export interface CapabilityMetadata {
  id: string;
  description: string;
  transports: CapabilityTransport[];
  /** 调用的命令行参数（用于帮助展示） */
  flags: string[];
  /** 返回数据结构描述 */
  resultShape: string;
  /** 是否启用 */
  enabled: boolean;
  /** 能力注册时间 */
  registeredAt: number;
}

// ===================== 内置能力目录 =====================

/**
 * 与 openclaw CAPABILITY_METADATA 保持一致的核心子集。
 * 实际能力由 server/routes 提供，CLI 仅作为声明与查询入口。
 */
const DEFAULT_CAPABILITIES: CapabilityMetadata[] = [
  {
    id: 'chat.send',
    description: '向 Agent 发送一条消息并等待回复',
    transports: ['local', 'gateway'],
    flags: ['--message <text>', '--session <sessionId>', '--json'],
    resultShape: '{ sessionId, reply, timestamp }',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'chat.stream',
    description: '流式接收 Agent 回复',
    transports: ['local', 'gateway'],
    flags: ['--message <text>', '--session <sessionId>'],
    resultShape: 'SSE chunks: { delta, finishReason }',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'models.list',
    description: '列出可用的 LLM 模型',
    transports: ['local', 'gateway'],
    flags: ['--provider <id>', '--json'],
    resultShape: 'Array<{ id, provider, label, capabilities }>',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'models.probe',
    description: '探测指定模型连通性',
    transports: ['local', 'gateway'],
    flags: ['--model <id>', '--json'],
    resultShape: '{ id, reachable, latencyMs }',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'skills.list',
    description: '列出已注册技能',
    transports: ['local'],
    flags: ['--tag <tag>', '--json'],
    resultShape: 'Array<{ id, name, tags, enabled }>',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'skills.invoke',
    description: '调用指定技能',
    transports: ['local', 'gateway'],
    flags: ['--id <skillId>', '--input <json>', '--json'],
    resultShape: '{ id, output, durationMs }',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'cron.run',
    description: '手动触发一个 cron 任务',
    transports: ['local'],
    flags: ['--id <jobId>'],
    resultShape: '{ id, startedAt, finishedAt, status }',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'cron.list',
    description: '列出全部 cron 任务',
    transports: ['local'],
    flags: ['--json'],
    resultShape: 'Array<{ id, cron, enabled, lastRunAt, nextRunAt }>',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'channels.list',
    description: '列出可用通道',
    transports: ['local'],
    flags: ['--all', '--json'],
    resultShape: 'Array<ChannelMeta>',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'channels.probe',
    description: '探测指定通道连通性',
    transports: ['local'],
    flags: ['--channel <id>', '--json'],
    resultShape: '{ id, reachable, details }',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'memory.search',
    description: '在 memory store 中执行语义搜索',
    transports: ['local', 'gateway'],
    flags: ['--query <text>', '--limit <n>', '--json'],
    resultShape: 'Array<{ id, content, score }>',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'memory.write',
    description: '写入一条记忆',
    transports: ['local', 'gateway'],
    flags: ['--content <text>', '--tags <csv>', '--json'],
    resultShape: '{ id, createdAt }',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'plugin.list',
    description: '列出已注册插件',
    transports: ['local'],
    flags: ['--json'],
    resultShape: 'Array<{ id, name, status }>',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'plugin.invoke',
    description: '调用一个插件',
    transports: ['local', 'gateway'],
    flags: ['--id <pluginId>', '--method <name>', '--input <json>', '--json'],
    resultShape: '{ id, output, durationMs }',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'acp.spawn',
    description: '派生 ACP 子代理',
    transports: ['local'],
    flags: ['--task <text>', '--session <sessionKey>', '--json'],
    resultShape: 'AcpAgent',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'acp.kill',
    description: '终止 ACP 子代理',
    transports: ['local'],
    flags: ['--id <agentId>', '--force'],
    resultShape: '{ id, status }',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'pairing.list',
    description: '列出已配对设备',
    transports: ['local'],
    flags: ['--json'],
    resultShape: 'Array<PairedDevice>',
    enabled: true,
    registeredAt: 0,
  },
  {
    id: 'pairing.pair',
    description: '配对一个设备',
    transports: ['local'],
    flags: ['--deviceId <id>', '--name <name>', '--json'],
    resultShape: 'PairedDevice',
    enabled: true,
    registeredAt: 0,
  },
];

// ===================== 持久化 =====================

function resolveStateDir(): string {
  return process.env.CROSSWMS_STATE_DIR || path.join(os.homedir(), '.crosswms');
}

function resolveCapabilitiesPath(): string {
  return path.join(resolveStateDir(), 'capabilities.json');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

interface CapsFile {
  capabilities: CapabilityMetadata[];
}

async function readCapsFile(): Promise<CapsFile> {
  const filePath = resolveCapabilitiesPath();
  if (!(await pathExists(filePath))) {
    // 首次启动：写入默认目录
    const now = Date.now();
    return {
      capabilities: DEFAULT_CAPABILITIES.map((c) => ({ ...c, registeredAt: now })),
    };
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<CapsFile>;
    const list = Array.isArray(parsed.capabilities) ? parsed.capabilities : [];
    // 合并：默认目录 + 用户持久化（用户优先级更高）
    const byId = new Map<string, CapabilityMetadata>();
    for (const c of list) byId.set(c.id, c);
    for (const c of DEFAULT_CAPABILITIES) {
      if (!byId.has(c.id)) byId.set(c.id, c);
    }
    return { capabilities: Array.from(byId.values()) };
  } catch {
    const now = Date.now();
    return {
      capabilities: DEFAULT_CAPABILITIES.map((c) => ({ ...c, registeredAt: now })),
    };
  }
}

async function writeCapsFile(file: CapsFile): Promise<void> {
  const filePath = resolveCapabilitiesPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(file, null, 2), 'utf-8');
}

// ===================== 核心操作函数 =====================

/** 列出全部能力（可按 transport 过滤） */
export async function listCapabilities(options: {
  transport?: CapabilityTransport;
} = {}): Promise<CapabilityMetadata[]> {
  const file = await readCapsFile();
  if (!options.transport) return file.capabilities;
  return file.capabilities.filter((c) => c.transports.includes(options.transport!));
}

/** 查看单个能力 */
export async function inspectCapability(id: string): Promise<CapabilityMetadata | undefined> {
  const file = await readCapsFile();
  return file.capabilities.find((c) => c.id === id);
}

/** 启用/停用一个能力 */
export async function setCapabilityEnabled(id: string, enabled: boolean): Promise<CapabilityMetadata | undefined> {
  const file = await readCapsFile();
  const idx = file.capabilities.findIndex((c) => c.id === id);
  if (idx < 0) return undefined;
  file.capabilities[idx] = { ...file.capabilities[idx], enabled };
  await writeCapsFile(file);
  return file.capabilities[idx];
}

/** 重新加载默认能力目录（追加缺失项） */
export async function reloadCapabilities(): Promise<number> {
  const file = await readCapsFile();
  let added = 0;
  const known = new Set(file.capabilities.map((c) => c.id));
  for (const c of DEFAULT_CAPABILITIES) {
    if (!known.has(c.id)) {
      file.capabilities.push({ ...c, registeredAt: Date.now() });
      added += 1;
    }
  }
  await writeCapsFile(file);
  return added;
}

// ===================== Commander 子命令 =====================

export const capabilityCommand = new Command('capability')
  .description('能力声明管理（list / inspect / enable / disable / reload）')
  .version('1.0.0');

// list 子命令
capabilityCommand
  .command('list')
  .description('列出所有已注册能力')
  .option('-t, --transport <transport>', '按 transport 过滤（local/gateway）')
  .option('--enabled-only', '仅显示启用的能力', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (opts: { transport?: string; enabledOnly: boolean; json: boolean }) => {
      const list = await listCapabilities({
        ...(opts.transport ? { transport: opts.transport as CapabilityTransport } : {}),
      });
      const filtered = opts.enabledOnly ? list.filter((c) => c.enabled) : list;
      if (opts.json) {
        console.log(JSON.stringify({ capabilities: filtered }, null, 2));
        return;
      }
      console.log(`能力目录（共 ${filtered.length} 个）:`);
      console.log('');
      for (const c of filtered) {
        const status = c.enabled ? '✓' : '○';
        console.log(`  ${status} ${c.id}`);
        console.log(`    ${c.description}`);
        console.log(`    transport: ${c.transports.join(', ')}`);
        console.log(`    flags: ${c.flags.join(' ')}`);
        console.log(`    返回: ${c.resultShape}`);
        console.log('');
      }
    },
  );

// inspect 子命令
capabilityCommand
  .command('inspect <id>')
  .description('查看一个能力的详细元数据')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (id: string, opts: { json: boolean }) => {
    const cap = await inspectCapability(id);
    if (opts.json) {
      console.log(JSON.stringify({ found: Boolean(cap), capability: cap }, null, 2));
      return;
    }
    if (!cap) {
      console.log(`未找到能力: ${id}`);
      return;
    }
    console.log(`能力: ${cap.id}`);
    console.log(`  描述: ${cap.description}`);
    console.log(`  状态: ${cap.enabled ? '启用' : '停用'}`);
    console.log(`  transport: ${cap.transports.join(', ')}`);
    console.log(`  flags: ${cap.flags.join(' ')}`);
    console.log(`  返回结构: ${cap.resultShape}`);
    if (cap.registeredAt > 0) {
      console.log(`  注册时间: ${new Date(cap.registeredAt).toLocaleString()}`);
    }
  });

// enable 子命令
capabilityCommand
  .command('enable <id>')
  .description('启用一个能力')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (id: string, opts: { json: boolean }) => {
    const cap = await setCapabilityEnabled(id, true);
    if (opts.json) {
      console.log(JSON.stringify({ id, enabled: Boolean(cap && cap.enabled), capability: cap }, null, 2));
      return;
    }
    if (!cap) {
      console.log(`未找到能力: ${id}`);
      return;
    }
    console.log(`能力 ${id} 已启用`);
  });

// disable 子命令
capabilityCommand
  .command('disable <id>')
  .description('停用一个能力')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (id: string, opts: { json: boolean }) => {
    const cap = await setCapabilityEnabled(id, false);
    if (opts.json) {
      console.log(JSON.stringify({ id, enabled: Boolean(cap && cap.enabled), capability: cap }, null, 2));
      return;
    }
    if (!cap) {
      console.log(`未找到能力: ${id}`);
      return;
    }
    console.log(`能力 ${id} 已停用`);
  });

// reload 子命令
capabilityCommand
  .command('reload')
  .description('重新加载默认能力目录（追加缺失项）')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (opts: { json: boolean }) => {
    const added = await reloadCapabilities();
    if (opts.json) {
      console.log(JSON.stringify({ added }, null, 2));
      return;
    }
    console.log(`已重新加载，新增 ${added} 个能力`);
  });
