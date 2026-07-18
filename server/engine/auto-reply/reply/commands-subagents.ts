// 子 agent 命令处理：精简版实现，维护子 agent 运行记录内存态注册表。
import { logger } from '../../../logger.js';

// 支持的子 agent 子命令
export type SubagentCommand = 'spawn' | 'list' | 'kill' | 'status' | 'help';

// 子 agent 运行状态
export type SubagentRunStatus = 'running' | 'completed' | 'killed' | 'failed';

// 子 agent 运行记录
export type SubagentRunRecord = {
  runId: string;
  parentSessionKey: string;
  childSessionKey: string;
  agentId: string;
  taskName?: string;
  status: SubagentRunStatus;
  startedAt: number;
  endedAt?: number;
  error?: string;
};

// 子 agent 命令上下文
export type SubagentCommandContext = {
  sessionId?: string;
  sessionKey?: string;
  workspaceDir?: string;
  userId?: string;
  agentId?: string;
  [key: string]: unknown;
};

// 子 agent 命令处理结果
export type SubagentCommandResult = {
  handled: boolean;
  reply?: string;
  error?: string;
  runId?: string;
};

// 子 agent 运行内存注册表
const subagentRuns = new Map<string, SubagentRunRecord>();

function normalizeCommand(raw: string): SubagentCommand {
  const lower = raw.trim().toLowerCase();
  if (lower === 'spawn' || lower === 'list' || lower === 'kill' || lower === 'status') {
    return lower;
  }
  return 'help';
}

function generateRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveHelpText(): string {
  return [
    'Subagents',
    'Usage:',
    '- /subagents spawn <agent-id> [task-name]',
    '- /subagents list',
    '- /subagents kill <run-id>',
    '- /subagents status <run-id>',
    '',
    'Ids: use the runId returned by /subagents spawn.',
  ].join('\n');
}

function parseSpawnArgs(args: string[]): {
  agentId?: string;
  taskName?: string;
  error?: string;
} {
  const agentId = args[0];
  if (!agentId) {
    return { error: 'Subagent agent id is required. Usage: /subagents spawn <agent-id> [task-name]' };
  }
  if (agentId.startsWith('--')) {
    return { error: `Unknown option: ${agentId}` };
  }
  const taskName = args.slice(1).join(' ').trim() || undefined;
  return { agentId, taskName };
}

function resolveRequesterKey(context: SubagentCommandContext): string {
  return context.sessionKey ?? context.sessionId ?? 'main';
}

async function handleSpawn(
  args: string[],
  context: SubagentCommandContext,
): Promise<SubagentCommandResult> {
  const parsed = parseSpawnArgs(args);
  if (parsed.error) {
    return { handled: true, error: parsed.error };
  }
  const agentId = parsed.agentId!;
  const parentSessionKey = resolveRequesterKey(context);
  const runId = generateRunId();
  const childSessionKey = `${parentSessionKey}:subagent:${runId}`;
  const record: SubagentRunRecord = {
    runId,
    parentSessionKey,
    childSessionKey,
    agentId,
    taskName: parsed.taskName,
    status: 'running',
    startedAt: Date.now(),
  };
  subagentRuns.set(runId, record);
  logger.info(`[Subagents] Spawned ${runId} for agent ${agentId} under ${parentSessionKey}`);
  return {
    handled: true,
    runId,
    reply: `✅ Spawned subagent ${runId} (agent ${agentId})${
      parsed.taskName ? ` for task "${parsed.taskName}"` : ''
    }.`,
  };
}

async function handleList(
  _args: string[],
  context: SubagentCommandContext,
): Promise<SubagentCommandResult> {
  if (subagentRuns.size === 0) {
    return { handled: true, reply: 'No subagent runs registered.' };
  }
  const requesterKey = resolveRequesterKey(context);
  const runs = Array.from(subagentRuns.values()).filter(
    (r) => r.parentSessionKey === requesterKey,
  );
  if (runs.length === 0) {
    return { handled: true, reply: `No subagent runs for session ${requesterKey}.` };
  }
  const lines = runs.map(formatRun);
  return { handled: true, reply: lines.join('\n---\n') };
}

async function handleKill(
  args: string[],
  _context: SubagentCommandContext,
): Promise<SubagentCommandResult> {
  const runId = args[0];
  if (!runId) {
    return { handled: true, error: 'Usage: /subagents kill <run-id>' };
  }
  const record = subagentRuns.get(runId);
  if (!record) {
    return { handled: true, error: `Unknown subagent run: ${runId}` };
  }
  if (record.status === 'killed') {
    return { handled: true, reply: `Subagent ${runId} is already killed.` };
  }
  record.status = 'killed';
  record.endedAt = Date.now();
  logger.info(`[Subagents] Killed run ${runId}`);
  return {
    handled: true,
    runId,
    reply: `✅ Killed subagent ${runId}.`,
  };
}

async function handleStatus(
  args: string[],
  _context: SubagentCommandContext,
): Promise<SubagentCommandResult> {
  const runId = args[0];
  if (!runId) {
    return { handled: true, error: 'Usage: /subagents status <run-id>' };
  }
  const record = subagentRuns.get(runId);
  if (!record) {
    return { handled: true, error: `Unknown subagent run: ${runId}` };
  }
  return { handled: true, runId, reply: formatRun(record) };
}

function formatRun(record: SubagentRunRecord): string {
  const parts = [
    `runId=${record.runId}`,
    `agent=${record.agentId}`,
    `parent=${record.parentSessionKey}`,
    `child=${record.childSessionKey}`,
    `status=${record.status}`,
    `startedAt=${new Date(record.startedAt).toISOString()}`,
  ];
  if (record.taskName) parts.push(`task=${record.taskName}`);
  if (record.endedAt) parts.push(`endedAt=${new Date(record.endedAt).toISOString()}`);
  if (record.error) parts.push(`error=${record.error}`);
  return parts.join(', ');
}

// 导出主入口：根据子命令分发到对应处理器。
export async function handleSubagentCommand(
  command: string,
  args: string[] = [],
  context: SubagentCommandContext = {},
): Promise<SubagentCommandResult> {
  const action = normalizeCommand(command);
  switch (action) {
    case 'spawn':
      return handleSpawn(args, context);
    case 'list':
      return handleList(args, context);
    case 'kill':
      return handleKill(args, context);
    case 'status':
      return handleStatus(args, context);
    case 'help':
    default:
      return { handled: true, reply: resolveHelpText() };
  }
}

// 测试辅助：清空内存注册表（仅用于测试场景）。
export function clearSubagentRuns(): void {
  subagentRuns.clear();
}

// 测试辅助：读取运行记录快照（仅用于测试场景）。
export function getSubagentRunSnapshot(): SubagentRunRecord[] {
  return Array.from(subagentRuns.values());
}
