// exec 指令处理：精简版实现，维护运行中 exec 任务内存态注册表。
import { logger } from '../../../logger.js';

// 支持的 exec 指令
export type ExecDirectiveName = 'run' | 'cancel' | 'status' | 'help';

// exec 任务状态
export type ExecRunStatus = 'running' | 'completed' | 'cancelled' | 'failed';

// exec 指令结构
export type ExecDirective = {
  // 子指令名称
  name: ExecDirectiveName;
  // 要执行的命令（仅 run 指令使用）
  command?: string;
  // 目标任务 id（仅 cancel/status 使用）
  taskId?: string;
  // 工作目录覆盖
  cwd?: string;
  // 超时（毫秒）
  timeoutMs?: number;
};

// exec 任务记录
export type ExecTaskRecord = {
  taskId: string;
  command: string;
  cwd?: string;
  status: ExecRunStatus;
  startedAt: number;
  endedAt?: number;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  error?: string;
};

// exec 指令上下文
export type ExecDirectiveContext = {
  sessionId?: string;
  workspaceDir?: string;
  userId?: string;
  [key: string]: unknown;
};

// exec 指令处理结果
export type ExecDirectiveResult = {
  handled: boolean;
  reply?: string;
  error?: string;
  taskId?: string;
};

// exec 任务内存注册表
const execTasks = new Map<string, ExecTaskRecord>();

function generateTaskId(): string {
  return `exec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function resolveHelpText(): string {
  return [
    'Exec directives:',
    '-----',
    '/exec run <command> [--cwd <path>] [--timeout <ms>]',
    '/exec cancel <task-id>',
    '/exec status <task-id>',
    '',
    'Notes:',
    '- /exec run 在内存中登记一个 exec 任务（精简版不实际执行 shell）。',
    '- /exec cancel 标记任务为已取消。',
    '- /exec status 返回任务状态摘要。',
  ].join('\n');
}

// 解析原始指令文本为 ExecDirective 结构。
// 支持两种形式：
//   1. 结构化对象：直接符合 ExecDirective 形状
//   2. 字符串：形如 "/exec run echo hello --cwd /tmp"
export function parseExecDirective(input: string | ExecDirective): ExecDirective {
  if (typeof input !== 'string') {
    return input;
  }
  const trimmed = input.trim();
  // 去掉可选的 /exec 前缀
  const stripped = trimmed.replace(/^\/exec\s+/i, '');
  const tokens = stripped.split(/\s+/).filter(Boolean);
  const [nameRaw, ...rest] = tokens;
  const name = normalizeDirectiveName(nameRaw);

  if (name === 'run') {
    return parseRunTokens(rest);
  }
  if (name === 'cancel' || name === 'status') {
    const taskId = rest[0];
    return { name, taskId };
  }
  return { name: 'help' };
}

function normalizeDirectiveName(raw?: string): ExecDirectiveName {
  const lower = (raw ?? '').trim().toLowerCase();
  if (lower === 'run' || lower === 'cancel' || lower === 'status') {
    return lower;
  }
  return 'help';
}

function parseRunTokens(tokens: string[]): ExecDirective {
  let cwd: string | undefined;
  let timeoutMs: number | undefined;
  const commandTokens: string[] = [];

  for (let i = 0; i < tokens.length; ) {
    const token = tokens[i] ?? '';
    if (token === '--cwd') {
      const next = tokens[i + 1];
      if (!next) {
        return { name: 'run', command: commandTokens.join(' '), cwd, error: '--cwd requires a value' } as ExecDirective & { error: string };
      }
      cwd = next;
      i += 2;
      continue;
    }
    if (token === '--timeout') {
      const next = tokens[i + 1];
      if (!next) {
        return { name: 'run', command: commandTokens.join(' '), cwd, timeoutMs, error: '--timeout requires a value' } as ExecDirective & { error: string };
      }
      const parsed = Number.parseInt(next, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { name: 'run', command: commandTokens.join(' '), cwd, timeoutMs, error: `Invalid --timeout value: ${next}` } as ExecDirective & { error: string };
      }
      timeoutMs = parsed;
      i += 2;
      continue;
    }
    commandTokens.push(token);
    i += 1;
  }

  return { name: 'run', command: commandTokens.join(' ').trim() || undefined, cwd, timeoutMs };
}

async function handleRun(
  directive: ExecDirective,
  context: ExecDirectiveContext,
): Promise<ExecDirectiveResult> {
  const command = directive.command?.trim();
  if (!command) {
    return { handled: true, error: 'Usage: /exec run <command>' };
  }
  const taskId = generateTaskId();
  const record: ExecTaskRecord = {
    taskId,
    command,
    cwd: directive.cwd ?? context.workspaceDir,
    status: 'running',
    startedAt: Date.now(),
  };
  execTasks.set(taskId, record);
  logger.info(`[Exec] Registered task ${taskId}: ${command}`);
  return {
    handled: true,
    taskId,
    reply: `✅ Registered exec task ${taskId}: ${command}`,
  };
}

async function handleCancel(
  directive: ExecDirective,
  _context: ExecDirectiveContext,
): Promise<ExecDirectiveResult> {
  const taskId = directive.taskId;
  if (!taskId) {
    return { handled: true, error: 'Usage: /exec cancel <task-id>' };
  }
  const record = execTasks.get(taskId);
  if (!record) {
    return { handled: true, error: `Unknown exec task: ${taskId}` };
  }
  if (record.status === 'cancelled') {
    return { handled: true, reply: `Exec task ${taskId} is already cancelled.` };
  }
  record.status = 'cancelled';
  record.endedAt = Date.now();
  logger.info(`[Exec] Cancelled task ${taskId}`);
  return {
    handled: true,
    taskId,
    reply: `✅ Cancelled exec task ${taskId}.`,
  };
}

async function handleStatus(
  directive: ExecDirective,
  _context: ExecDirectiveContext,
): Promise<ExecDirectiveResult> {
  const taskId = directive.taskId;
  if (!taskId) {
    return { handled: true, error: 'Usage: /exec status <task-id>' };
  }
  const record = execTasks.get(taskId);
  if (!record) {
    return { handled: true, error: `Unknown exec task: ${taskId}` };
  }
  return { handled: true, taskId, reply: formatTask(record) };
}

function formatTask(record: ExecTaskRecord): string {
  const parts = [
    `taskId=${record.taskId}`,
    `command=${record.command}`,
    `status=${record.status}`,
    `startedAt=${new Date(record.startedAt).toISOString()}`,
  ];
  if (record.cwd) parts.push(`cwd=${record.cwd}`);
  if (record.endedAt) parts.push(`endedAt=${new Date(record.endedAt).toISOString()}`);
  if (typeof record.exitCode === 'number') parts.push(`exitCode=${record.exitCode}`);
  if (record.error) parts.push(`error=${record.error}`);
  return parts.join(', ');
}

// 导出主入口：根据指令名称分发到对应处理器。
export async function handleExecDirective(
  directive: ExecDirective | string,
  context: ExecDirectiveContext = {},
): Promise<ExecDirectiveResult> {
  const parsed = typeof directive === 'string' ? parseExecDirective(directive) : directive;
  // 解析阶段可能附带 error 字段
  const maybeError = (parsed as ExecDirective & { error?: string }).error;
  if (maybeError) {
    return { handled: true, error: maybeError };
  }
  switch (parsed.name) {
    case 'run':
      return handleRun(parsed, context);
    case 'cancel':
      return handleCancel(parsed, context);
    case 'status':
      return handleStatus(parsed, context);
    case 'help':
    default:
      return { handled: true, reply: resolveHelpText() };
  }
}

// 测试辅助：清空内存注册表（仅用于测试场景）。
export function clearExecTasks(): void {
  execTasks.clear();
}

// 测试辅助：读取任务快照（仅用于测试场景）。
export function getExecTaskSnapshot(): ExecTaskRecord[] {
  return Array.from(execTasks.values());
}
