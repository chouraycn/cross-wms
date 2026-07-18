// ACP 命令处理：精简版实现，维护会话内存态注册表。
import { logger } from '../../../logger.js';

// 支持的 ACP 子命令
export type AcpCommand = 'start' | 'stop' | 'status' | 'help';

// ACP 会话状态
export type AcpSessionStatus = 'running' | 'stopped' | 'idle';

// ACP 会话记录
export type AcpSession = {
  sessionKey: string;
  agentId: string;
  mode: 'persistent' | 'oneshot';
  cwd?: string;
  label?: string;
  status: AcpSessionStatus;
  startedAt: number;
  endedAt?: number;
};

// ACP 命令上下文
export type AcpCommandContext = {
  sessionId?: string;
  workspaceDir?: string;
  userId?: string;
  agentId?: string;
  channel?: string;
  [key: string]: unknown;
};

// ACP 命令处理结果
export type AcpCommandResult = {
  handled: boolean;
  reply?: string;
  error?: string;
  sessionKey?: string;
};

// ACP 会话内存注册表
const acpSessions = new Map<string, AcpSession>();

function normalizeCommand(raw: string): AcpCommand {
  const lower = raw.trim().toLowerCase();
  if (lower === 'start' || lower === 'stop' || lower === 'status') {
    return lower;
  }
  return 'help';
}

function generateSessionKey(agentId: string): string {
  const id = Math.random().toString(36).slice(2, 10);
  return `agent:${agentId}:acp:${id}`;
}

function resolveHelpText(): string {
  return [
    'ACP commands:',
    '-----',
    '/acp start [agent-id] [--mode persistent|oneshot] [--cwd <path>] [--label <label>]',
    '/acp stop [session-key]',
    '/acp status [session-key]',
    '',
    'Notes:',
    '- /acp start 在内存中注册一个 ACP 会话。',
    '- /acp stop 标记会话为已停止。',
    '- /acp status 返回当前会话或全部会话的状态摘要。',
  ].join('\n');
}

function parseStartArgs(args: string[]): {
  agentId?: string;
  mode: 'persistent' | 'oneshot';
  cwd?: string;
  label?: string;
  error?: string;
} {
  let mode: 'persistent' | 'oneshot' = 'persistent';
  let cwd: string | undefined;
  let label: string | undefined;
  let agentId: string | undefined;

  for (let i = 0; i < args.length; ) {
    const token = args[i] ?? '';
    if (token === '--mode') {
      const next = args[i + 1];
      if (next !== 'persistent' && next !== 'oneshot') {
        return { mode, error: `Invalid --mode value "${next ?? ''}". Use persistent or oneshot.` };
      }
      mode = next;
      i += 2;
      continue;
    }
    if (token === '--cwd') {
      const next = args[i + 1];
      if (!next) {
        return { mode, error: '--cwd requires a value' };
      }
      cwd = next;
      i += 2;
      continue;
    }
    if (token === '--label') {
      const next = args[i + 1];
      if (!next) {
        return { mode, error: '--label requires a value' };
      }
      label = next;
      i += 2;
      continue;
    }
    if (token.startsWith('--')) {
      return { mode, error: `Unknown option: ${token}` };
    }
    if (!agentId) {
      agentId = token;
      i += 1;
      continue;
    }
    return { mode, error: `Unexpected argument: ${token}` };
  }

  return { agentId, mode, cwd, label };
}

async function handleStart(
  args: string[],
  context: AcpCommandContext,
): Promise<AcpCommandResult> {
  const parsed = parseStartArgs(args);
  if (parsed.error) {
    return { handled: true, error: parsed.error };
  }
  const agentId = parsed.agentId ?? context.agentId;
  if (!agentId) {
    return {
      handled: true,
      error: 'ACP target agent id is required. Pass an agent id or set context.agentId.',
    };
  }

  const sessionKey = generateSessionKey(agentId);
  const session: AcpSession = {
    sessionKey,
    agentId,
    mode: parsed.mode,
    cwd: parsed.cwd ?? context.workspaceDir,
    label: parsed.label,
    status: 'running',
    startedAt: Date.now(),
  };
  acpSessions.set(sessionKey, session);
  logger.info(`[ACP] Started session ${sessionKey} (mode=${parsed.mode})`);
  return {
    handled: true,
    sessionKey,
    reply: `✅ Spawned ACP session ${sessionKey} (${parsed.mode}, agent ${agentId}).`,
  };
}

async function handleStop(
  args: string[],
  _context: AcpCommandContext,
): Promise<AcpCommandResult> {
  const sessionKey = args[0];
  if (!sessionKey) {
    return { handled: true, error: 'Usage: /acp stop <session-key>' };
  }
  const session = acpSessions.get(sessionKey);
  if (!session) {
    return { handled: true, error: `Unknown ACP session: ${sessionKey}` };
  }
  if (session.status === 'stopped') {
    return { handled: true, reply: `ACP session ${sessionKey} is already stopped.` };
  }
  session.status = 'stopped';
  session.endedAt = Date.now();
  logger.info(`[ACP] Stopped session ${sessionKey}`);
  return {
    handled: true,
    sessionKey,
    reply: `✅ Stopped ACP session ${sessionKey}.`,
  };
}

async function handleStatus(
  args: string[],
  _context: AcpCommandContext,
): Promise<AcpCommandResult> {
  const sessionKey = args[0];
  if (sessionKey) {
    const session = acpSessions.get(sessionKey);
    if (!session) {
      return { handled: true, error: `Unknown ACP session: ${sessionKey}` };
    }
    return { handled: true, sessionKey, reply: formatSession(session) };
  }

  if (acpSessions.size === 0) {
    return { handled: true, reply: 'No ACP sessions registered.' };
  }
  const lines = Array.from(acpSessions.values()).map(formatSession);
  return { handled: true, reply: lines.join('\n---\n') };
}

function formatSession(session: AcpSession): string {
  const parts = [
    `session=${session.sessionKey}`,
    `agent=${session.agentId}`,
    `mode=${session.mode}`,
    `status=${session.status}`,
    `startedAt=${new Date(session.startedAt).toISOString()}`,
  ];
  if (session.cwd) parts.push(`cwd=${session.cwd}`);
  if (session.label) parts.push(`label=${session.label}`);
  if (session.endedAt) parts.push(`endedAt=${new Date(session.endedAt).toISOString()}`);
  return parts.join(', ');
}

// 导出主入口：根据子命令分发到对应处理器。
export async function handleAcpCommand(
  command: string,
  args: string[] = [],
  context: AcpCommandContext = {},
): Promise<AcpCommandResult> {
  const action = normalizeCommand(command);
  switch (action) {
    case 'start':
      return handleStart(args, context);
    case 'stop':
      return handleStop(args, context);
    case 'status':
      return handleStatus(args, context);
    case 'help':
    default:
      return { handled: true, reply: resolveHelpText() };
  }
}

// 测试辅助：清空内存注册表（仅用于测试场景）。
export function clearAcpSessions(): void {
  acpSessions.clear();
}

// 测试辅助：读取会话快照（仅用于测试场景）。
export function getAcpSessionSnapshot(): AcpSession[] {
  return Array.from(acpSessions.values());
}
