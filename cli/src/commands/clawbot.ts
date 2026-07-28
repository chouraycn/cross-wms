/**
 * clawbot (AI 对话) CLI 命令。
 *
 * 参考 openclaw/src/cli/clawbot-cli.ts 的命令形态，在 cross-wms CLI 中提供
 * 与本地 Agent 模型对话的能力。本模块为自包含实现：
 *  - 会话历史持久化到 ~/.crosswms/clawbot-history.json
 *  - 消息发送通过占位 provider 完成（实际场景下可对接 server/routes/chat）
 *  - 支持 JSON 解析、流式模拟（按 token 分片输出）
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Command } from 'commander';

// ===================== 类型定义 =====================

/** 消息角色 */
export type Role = 'system' | 'user' | 'assistant';

/** 单条消息 */
export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  timestamp: number;
  model?: string;
}

/** 会话 */
export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  messages: ChatMessage[];
}

/** 持久化文件结构 */
interface HistoryFile {
  sessions: ChatSession[];
  activeSessionId: string | null;
}

// ===================== 持久化 =====================

function resolveStateDir(): string {
  return process.env.CROSSWMS_STATE_DIR || path.join(os.homedir(), '.crosswms');
}

function resolveHistoryPath(): string {
  return path.join(resolveStateDir(), 'clawbot-history.json');
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readHistory(): Promise<HistoryFile> {
  const filePath = resolveHistoryPath();
  if (!(await pathExists(filePath))) {
    return { sessions: [], activeSessionId: null };
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as Partial<HistoryFile>;
    return {
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      activeSessionId: parsed.activeSessionId ?? null,
    };
  } catch {
    return { sessions: [], activeSessionId: null };
  }
}

async function writeHistory(file: HistoryFile): Promise<void> {
  const filePath = resolveHistoryPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(file, null, 2), 'utf-8');
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ===================== 核心操作函数 =====================

/**
 * 创建或获取当前活跃会话。
 */
export async function ensureSession(
  sessionId?: string,
  options: { model?: string; title?: string } = {},
): Promise<ChatSession> {
  const file = await readHistory();
  let session =
    sessionId !== undefined
      ? file.sessions.find((s) => s.id === sessionId)
      : file.sessions.find((s) => s.id === file.activeSessionId);
  if (!session) {
    const now = Date.now();
    session = {
      id: sessionId ?? generateId('sess'),
      title: options.title ?? `会话 ${new Date(now).toLocaleString()}`,
      createdAt: now,
      updatedAt: now,
      model: options.model ?? 'default',
      messages: [],
    };
    file.sessions.push(session);
  }
  if (options.model) session.model = options.model;
  file.activeSessionId = session.id;
  await writeHistory(file);
  return session;
}

/**
 * 发送消息并获取回复（同步模拟实现）。
 * 实际生产环境应替换为对 server/routes/chat 的 HTTP 调用。
 */
export async function sendMessage(
  sessionId: string | undefined,
  prompt: string,
  options: { model?: string; stream?: boolean } = {},
): Promise<{ session: ChatSession; reply: string }> {
  if (!prompt || !prompt.trim()) {
    throw new Error('消息内容不能为空');
  }
  const session = await ensureSession(sessionId, { model: options.model });
  const now = Date.now();

  // 追加 user 消息
  const userMessage: ChatMessage = {
    id: generateId('msg'),
    role: 'user',
    content: prompt,
    timestamp: now,
  };
  session.messages.push(userMessage);

  // 模拟 assistant 回复（生产环境替换为真实 LLM 调用）
  const reply = generateMockReply(prompt, session.model);
  const assistantMessage: ChatMessage = {
    id: generateId('msg'),
    role: 'assistant',
    content: reply,
    timestamp: now + 1,
    model: session.model,
  };
  session.messages.push(assistantMessage);
  session.updatedAt = now + 1;

  // 持久化
  const file = await readHistory();
  const idx = file.sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) file.sessions[idx] = session;
  file.activeSessionId = session.id;
  await writeHistory(file);

  return { session, reply };
}

/**
 * 模拟 assistant 回复生成。
 * 真实实现应调用 LLM；此处按 token 分片以演示流式输出能力。
 */
function generateMockReply(prompt: string, model: string): string {
  const prefix = `[${model}]`;
  const body = `已收到您的输入："${prompt.trim().slice(0, 80)}"。这是一个模拟回复，真实环境下会调用 ${model} 生成内容。`;
  return `${prefix} ${body}`;
}

/**
 * 按 token 模拟流式输出。
 */
export async function streamMessage(
  sessionId: string | undefined,
  prompt: string,
  options: { model?: string } = {},
  onChunk: (chunk: string) => void = () => {},
): Promise<{ session: ChatSession; reply: string }> {
  const { session, reply } = await sendMessage(sessionId, prompt, options);
  // 按"token"分片（每 8 字符）模拟流式
  const chunkSize = 8;
  for (let i = 0; i < reply.length; i += chunkSize) {
    onChunk(reply.slice(i, i + chunkSize));
    // 短暂延时，便于终端可视化（测试中可忽略）
    await new Promise((r) => setTimeout(r, 0));
  }
  return { session, reply };
}

/** 列出会话 */
export async function listSessions(): Promise<ChatSession[]> {
  const file = await readHistory();
  return file.sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 查看指定会话的最近消息 */
export async function getSessionHistory(
  sessionId: string,
  options: { limit?: number } = {},
): Promise<ChatMessage[]> {
  const file = await readHistory();
  const session = file.sessions.find((s) => s.id === sessionId);
  if (!session) return [];
  const limit = options.limit ?? session.messages.length;
  return session.messages.slice(-limit);
}

/** 清空历史 */
export async function clearHistory(sessionId?: string): Promise<number> {
  const file = await readHistory();
  if (sessionId) {
    const idx = file.sessions.findIndex((s) => s.id === sessionId);
    if (idx < 0) return 0;
    const removed = file.sessions[idx].messages.length;
    file.sessions[idx].messages = [];
    await writeHistory(file);
    return removed;
  }
  // 清空全部会话的消息（保留会话壳）
  const total = file.sessions.reduce((acc, s) => acc + s.messages.length, 0);
  for (const s of file.sessions) {
    s.messages = [];
  }
  await writeHistory(file);
  return total;
}

// ===================== Commander 子命令 =====================

export const clawbotCommand = new Command('clawbot')
  .description('AI 对话 CLI 入口（send / history / list / clear）')
  .version('1.0.0');

// chat 子命令：发送消息
clawbotCommand
  .command('chat <message>')
  .description('发送一条消息并获取回复（默认非流式，可加 --stream 启用流式输出）')
  .option('-s, --session <sessionId>', '会话 ID（不指定则使用/创建活跃会话）')
  .option('-m, --model <model>', '指定模型', 'default')
  .option('--stream', '启用流式输出（按 token 分片写入）', false)
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (
      message: string,
      opts: { session?: string; model: string; stream: boolean; json: boolean },
    ) => {
      if (opts.json) {
        const { session, reply } = await sendMessage(opts.session, message, {
          model: opts.model,
        });
        console.log(JSON.stringify({ sessionId: session.id, reply, messageCount: session.messages.length }, null, 2));
        return;
      }
      if (opts.stream) {
        let acc = '';
        await streamMessage(
          opts.session,
          message,
          { model: opts.model },
          (chunk) => {
            acc += chunk;
            process.stdout.write(chunk);
          },
        );
        process.stdout.write('\n');
      } else {
        const { reply } = await sendMessage(opts.session, message, { model: opts.model });
        console.log(reply);
      }
    },
  );

// history 子命令：查看历史消息
clawbotCommand
  .command('history <sessionId>')
  .description('查看指定会话的消息历史')
  .option('-l, --limit <n>', '最近消息数', '50')
  .option('--json', '以 JSON 格式输出', false)
  .action(
    async (sessionId: string, opts: { limit: string; json: boolean }) => {
      const messages = await getSessionHistory(sessionId, {
        limit: Number.parseInt(opts.limit, 10) || 50,
      });
      if (opts.json) {
        console.log(JSON.stringify({ sessionId, messages }, null, 2));
        return;
      }
      if (messages.length === 0) {
        console.log(`会话 ${sessionId} 暂无消息`);
        return;
      }
      console.log(`会话 ${sessionId} 消息历史（共 ${messages.length} 条）:`);
      console.log('');
      for (const m of messages) {
        const role = m.role === 'user' ? '👤 user' : '🤖 assistant';
        const ts = new Date(m.timestamp).toLocaleString();
        console.log(`  [${ts}] ${role}:`);
        console.log(`    ${m.content}`);
      }
    },
  );

// list 子命令：列出所有会话
clawbotCommand
  .command('list')
  .description('列出所有会话')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (opts: { json: boolean }) => {
    const sessions = await listSessions();
    if (opts.json) {
      console.log(JSON.stringify({ sessions }, null, 2));
      return;
    }
    if (sessions.length === 0) {
      console.log('暂无会话');
      return;
    }
    console.log(`会话列表（共 ${sessions.length} 个）:`);
    console.log('');
    for (const s of sessions) {
      console.log(`  ${s.id}: ${s.title}`);
      console.log(`    模型: ${s.model}`);
      console.log(`    消息数: ${s.messages.length}`);
      console.log(`    更新时间: ${new Date(s.updatedAt).toLocaleString()}`);
      console.log('');
    }
  });

// clear 子命令：清空历史
clawbotCommand
  .command('clear [sessionId]')
  .description('清空指定会话（不传则清空全部）的消息历史')
  .option('--json', '以 JSON 格式输出', false)
  .action(async (sessionId: string | undefined, opts: { json: boolean }) => {
    const removed = await clearHistory(sessionId);
    if (opts.json) {
      console.log(JSON.stringify({ sessionId: sessionId ?? 'all', removed }));
      return;
    }
    console.log(`已清空 ${removed} 条消息${sessionId ? ` (会话 ${sessionId})` : '（全部会话）'}`);
  });
