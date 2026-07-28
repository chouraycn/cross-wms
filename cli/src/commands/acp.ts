/**
 * ACP（Agent Communication Protocol）子代理管理 CLI。
 *
 * 参考 openclaw/src/cli/acp-cli.ts 的命令形态（acp 主命令 + client 子命令），
 * 在 cross-wms CLI 中提供 ACP 子代理的 spawn / list / kill / status / logs 管理能力。
 * 状态持久化到 ~/.crosswms/acp-agents.json。
 */
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ===================== 类型定义 =====================

export type AcpAgentStatus = 'running' | 'stopped' | 'failed' | 'killed';

/** ACP 代理 */
export interface AcpAgent {
  id: string;
  /** 代理名称/标签 */
  name: string;
  /** 任务描述 */
  task: string;
  /** 启动时间 */
  startedAt: number;
  /** 结束时间 */
  endedAt?: number;
  status: AcpAgentStatus;
  /** 退出码（已结束时） */
  exitCode?: number;
  /** PID（仅模拟） */
  pid?: number;
  /** 关联的会话 key */
  sessionKey?: string;
  /** 日志文件路径 */
  logFile?: string;
}

interface AcpFile {
  agents: AcpAgent[];
}

// ===================== 持久化 =====================

function resolveStateDir(): string {
  return process.env.CROSSWMS_STATE_DIR || path.join(os.homedir(), '.crosswms');
}

function resolveAcpPath(): string {
  return path.join(resolveStateDir(), 'acp-agents.json');
}

function resolveAcpLogsDir(): string {
  return path.join(resolveStateDir(), 'acp-logs');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readAcpFile(): Promise<AcpFile> {
  const filePath = resolveAcpPath();
  if (!(await pathExists(filePath))) {
    return { agents: [] };
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<AcpFile>;
    return { agents: Array.isArray(parsed.agents) ? parsed.agents : [] };
  } catch {
    return { agents: [] };
  }
}

async function writeAcpFile(file: AcpFile): Promise<void> {
  const filePath = resolveAcpPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(file, null, 2), 'utf-8');
}

// ===================== 核心操作函数 =====================

/** 生成唯一 agent id */
function generateId(): string {
  return `acp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 启动一个 ACP 代理（模拟）。
 * 实际场景下应派生一个子进程或调用 ACP 网关。
 */
export async function spawnAgent(options: {
  name?: string;
  task: string;
  sessionKey?: string;
}): Promise<AcpAgent> {
  if (!options.task || !options.task.trim()) {
    throw new Error('task 不能为空');
  }
  const id = generateId();
  const now = Date.now();
  const logFile = path.join(resolveAcpLogsDir(), `${id}.log`);
  await fs.mkdir(path.dirname(logFile), { recursive: true });
  // 写入启动日志
  await fs.appendFile(
    logFile,
    `[${new Date(now).toISOString()}] ACP agent ${id} spawned: ${options.task}\n`,
    'utf-8',
  );

  const agent: AcpAgent = {
    id,
    name: options.name ?? `agent-${id.slice(-6)}`,
    task: options.task,
    startedAt: now,
    status: 'running',
    pid: Math.floor(Math.random() * 100000) + 1000,
    sessionKey: options.sessionKey,
    logFile,
  };

  const file = await readAcpFile();
  file.agents.push(agent);
  await writeAcpFile(file);
  return agent;
}

/** 列出所有 ACP 代理 */
export async function listAgents(options: { status?: AcpAgentStatus } = {}): Promise<AcpAgent[]> {
  const file = await readAcpFile();
  const list = options.status
    ? file.agents.filter((a) => a.status === options.status)
    : file.agents;
  return list.sort((a, b) => b.startedAt - a.startedAt);
}

/** 获取单个代理 */
export async function getAgent(id: string): Promise<AcpAgent | undefined> {
  const file = await readAcpFile();
  return file.agents.find((a) => a.id === id);
}

/**
 * 终止一个 ACP 代理。
 * 模拟实现：标记 status 为 killed 并写入结束日志。
 */
export async function killAgent(id: string, options: { force?: boolean } = {}): Promise<AcpAgent | undefined> {
  const file = await readAcpFile();
  const idx = file.agents.findIndex((a) => a.id === id);
  if (idx < 0) return undefined;
  const agent = file.agents[idx];
  if (agent.status !== 'running') {
    // 已结束，不能再次 kill
    if (!options.force) {
      throw new Error(`代理 ${id} 当前状态为 ${agent.status}，无法 kill`);
    }
    return agent;
  }
  const endedAt = Date.now();
  agent.status = 'killed';
  agent.endedAt = endedAt;
  agent.exitCode = 137;
  if (agent.logFile) {
    await fs.appendFile(
      agent.logFile,
      `[${new Date(endedAt).toISOString()}] killed by user (force=${Boolean(options.force)})\n`,
      'utf-8',
    ).catch(() => {});
  }
  file.agents[idx] = agent;
  await writeAcpFile(file);
  return agent;
}

/** 读取代理日志 */
export async function readAgentLog(id: string, options: { lines?: number } = {}): Promise<string[]> {
  const agent = await getAgent(id);
  if (!agent || !agent.logFile) return [];
  const lines = options.lines ?? 50;
  try {
    const content = await fs.readFile(agent.logFile, 'utf-8');
    return content.split('\n').filter(Boolean).slice(-lines);
  } catch {
    return [];
  }
}

// ===================== Commander 子命令 =====================

export const acpCommand = new Command('acp')
  .description('ACP 子代理管理（spawn / list / kill / status / logs）')
  .version('1.0.0');

// spawn 子命令
acpCommand
  .command('spawn <task>')
  .description('启动一个 ACP 子代理执行指定任务')
  .option('-n, --name <name>', '代理名称（便于识别）')
  .option('-s, --session <sessionKey>', '关联的会话 key')
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (
      task: string,
      opts: { name?: string; session?: string; json: boolean },
    ) => {
      const agent = await spawnAgent({
        name: opts.name,
        task,
        sessionKey: opts.session,
      });
      if (opts.json) {
        console.log(JSON.stringify(agent, null, 2));
        return;
      }
      console.log(`ACP 代理已启动:`);
      console.log(`  ID: ${agent.id}`);
      console.log(`  名称: ${agent.name}`);
      console.log(`  任务: ${agent.task}`);
      console.log(`  PID: ${agent.pid}`);
      console.log(`  状态: ${agent.status}`);
      if (agent.sessionKey) {
        console.log(`  会话: ${agent.sessionKey}`);
      }
    },
  );

// list 子命令
acpCommand
  .command('list')
  .description('列出所有 ACP 代理')
  .option('-s, --status <status>', '按状态过滤（running/stopped/failed/killed）')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (opts: { status?: string; json: boolean }) => {
    const agents = await listAgents({
      ...(opts.status ? { status: opts.status as AcpAgentStatus } : {}),
    });
    if (opts.json) {
      console.log(JSON.stringify({ agents }, null, 2));
      return;
    }
    if (agents.length === 0) {
      console.log('暂无 ACP 代理');
      return;
    }
    console.log(`ACP 代理列表（共 ${agents.length} 个）:`);
    console.log('');
    for (const a of agents) {
      const statusIcon =
        a.status === 'running' ? '▶' :
        a.status === 'killed' ? '■' :
        a.status === 'failed' ? '✗' : '○';
      console.log(`  ${statusIcon} ${a.id} (${a.name})`);
      console.log(`    任务: ${a.task}`);
      console.log(`    状态: ${a.status}${a.exitCode !== undefined ? ` (exit=${a.exitCode})` : ''}`);
      console.log(`    启动: ${new Date(a.startedAt).toLocaleString()}`);
      if (a.endedAt) {
        console.log(`    结束: ${new Date(a.endedAt).toLocaleString()}`);
      }
      console.log('');
    }
  });

// kill 子命令
acpCommand
  .command('kill <id>')
  .description('终止一个 ACP 代理')
  .option('-f, --force', '对已结束代理也强制执行（幂等）', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(async (id: string, opts: { force: boolean; json: boolean }) => {
    try {
      const agent = await killAgent(id, { force: opts.force });
      if (opts.json) {
        console.log(JSON.stringify({ id, killed: Boolean(agent && agent.status === 'killed'), agent }, null, 2));
        return;
      }
      if (!agent) {
        console.log(`未找到代理 ${id}`);
        return;
      }
      console.log(`代理 ${id} 已被终止（status=${agent.status}）`);
    } catch (err) {
      console.error(`kill 失败: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  });

// status 子命令
acpCommand
  .command('status <id>')
  .description('查询指定代理的详细状态')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (id: string, opts: { json: boolean }) => {
    const agent = await getAgent(id);
    if (opts.json) {
      console.log(JSON.stringify({ found: Boolean(agent), agent }, null, 2));
      return;
    }
    if (!agent) {
      console.log(`未找到代理 ${id}`);
      return;
    }
    console.log(`代理 ${id}:`);
    console.log(`  名称: ${agent.name}`);
    console.log(`  任务: ${agent.task}`);
    console.log(`  状态: ${agent.status}`);
    console.log(`  启动时间: ${new Date(agent.startedAt).toLocaleString()}`);
    if (agent.endedAt) {
      console.log(`  结束时间: ${new Date(agent.endedAt).toLocaleString()}`);
    }
    if (agent.exitCode !== undefined) {
      console.log(`  退出码: ${agent.exitCode}`);
    }
    if (agent.pid !== undefined) {
      console.log(`  PID: ${agent.pid}`);
    }
    if (agent.sessionKey) {
      console.log(`  会话: ${agent.sessionKey}`);
    }
    if (agent.logFile) {
      console.log(`  日志: ${agent.logFile}`);
    }
  });

// logs 子命令
acpCommand
  .command('logs <id>')
  .description('查看指定代理的最近日志')
  .option('-n, --lines <n>', '显示行数', '50')
  .action(async (id: string, opts: { lines: string }) => {
    const lines = Number.parseInt(opts.lines, 10) || 50;
    const logs = await readAgentLog(id, { lines });
    if (logs.length === 0) {
      console.log(`代理 ${id} 暂无日志`);
      return;
    }
    console.log(`代理 ${id} 最近 ${logs.length} 行日志:`);
    console.log('');
    for (const line of logs) {
      console.log(`  ${line}`);
    }
  });
