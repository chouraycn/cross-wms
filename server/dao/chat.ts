import { v4 as uuidv4 } from 'uuid';
import type { Session, Folder, Message } from '../db.js';
import { logger } from '../logger.js';
import { FileStorage } from '../storage/FileStorage.js';

// ===================== 消息大小限制 =====================

/** 单个 tool call 的 result 最大字节数（约 20KB），超出截断 */
const MAX_TOOL_RESULT_BYTES = 20 * 1024;
/** 单条消息的 toolCalls 总字节数上限（约 500KB），超出整体截断 */
const MAX_TOOLCALLS_TOTAL_BYTES = 500 * 1024;
/** thinking 字段最大字节数（约 100KB），超出截断 */
const MAX_THINKING_BYTES = 100 * 1024;

/**
 * 智能截断长文本：head+tail 策略，保留开头和结尾各一部分。
 * 相比只保留头部，能同时看到上下文头部和结果尾部的关键信息（如错误、最终输出等）。
 */
function smartTruncate(text: string, maxBytes: number): string {
  const textBytes = Buffer.byteLength(text, 'utf-8');
  if (textBytes <= maxBytes) return text;

  const headBytes = Math.floor(maxBytes * 0.6); // 60% 头部
  const tailBytes = Math.floor(maxBytes * 0.35); // 35% 尾部，剩余 5% 给截断标记

  // 找到 head 字节位置（按字符切片避免 UTF-8 乱码）
  let headEnd = Math.min(headBytes, text.length);
  while (headEnd > 0 && Buffer.byteLength(text.slice(0, headEnd), 'utf-8') > headBytes) {
    headEnd--;
  }

  // 找到 tail 字节位置
  let tailStart = Math.max(0, text.length - tailBytes);
  while (tailStart < text.length && Buffer.byteLength(text.slice(tailStart), 'utf-8') > tailBytes) {
    tailStart++;
  }

  const head = text.slice(0, headEnd);
  const tail = text.slice(tailStart);
  const skippedBytes = textBytes - Buffer.byteLength(head, 'utf-8') - Buffer.byteLength(tail, 'utf-8');

  return `${head}\n\n... [中间 ${(skippedBytes / 1024).toFixed(1)} KB 已省略] ...\n\n${tail}\n\n[已截断，原大小 ${(textBytes / 1024).toFixed(1)} KB]`;
}

/**
 * 截断 toolCalls 中的大 result，避免单条消息占用数百 MB。
 * 每个 tool call 的 result 超过 MAX_TOOL_RESULT_BYTES 时使用 head+tail 智能截断。
 * 总大小超过 MAX_TOOLCALLS_TOTAL_BYTES 时，早期项合并为摘要占位。
 */
function truncateToolCalls(toolCallsJson: string | undefined): string | undefined {
  if (!toolCallsJson) return toolCallsJson;

  // 快速路径：总大小未超限，直接返回
  if (Buffer.byteLength(toolCallsJson, 'utf-8') <= MAX_TOOLCALLS_TOTAL_BYTES) {
    return toolCallsJson;
  }

  try {
    const toolCalls = JSON.parse(toolCallsJson);
    if (!Array.isArray(toolCalls)) return toolCallsJson;

    let totalBytes = 0;
    const truncated: unknown[] = [];
    let firstDropped = true;
    let droppedCount = 0;

    for (const tc of toolCalls) {
      if (!tc || typeof tc !== 'object') continue;

      // 单条 result 智能截断（head+tail）
      const result = (tc as Record<string, unknown>).result;
      if (typeof result === 'string' && Buffer.byteLength(result, 'utf-8') > MAX_TOOL_RESULT_BYTES) {
        const truncatedResult = smartTruncate(result, MAX_TOOL_RESULT_BYTES);
        (tc as Record<string, unknown>).result = truncatedResult;
      }

      const entryBytes = Buffer.byteLength(JSON.stringify(tc), 'utf-8');
      if (totalBytes + entryBytes > MAX_TOOLCALLS_TOTAL_BYTES) {
        droppedCount++;
        if (firstDropped) {
          truncated.push({
            name: '__dropped__',
            arguments: '{}',
            result: `[后续 ${toolCalls.length - truncated.length} 次工具调用结果过大已省略]`,
            _omitted: true,
          });
          firstDropped = false;
        }
        continue;
      }

      totalBytes += entryBytes;
      truncated.push(tc);
    }

    return JSON.stringify(truncated);
  } catch {
    // 解析失败，直接截断字符串
    if (toolCallsJson.length > MAX_TOOLCALLS_TOTAL_BYTES) {
      return toolCallsJson.slice(0, MAX_TOOLCALLS_TOTAL_BYTES) + '...[truncated]';
    }
    return toolCallsJson;
  }
}

/** 截断 thinking 字段，避免过大 */
function truncateThinking(thinking: string | null | undefined): string | null | undefined {
  if (!thinking) return thinking;
  if (Buffer.byteLength(thinking, 'utf-8') <= MAX_THINKING_BYTES) return thinking;
  return thinking.slice(0, MAX_THINKING_BYTES) +
    `\n\n[思考内容已截断，原大小 ${(Buffer.byteLength(thinking, 'utf-8') / 1024).toFixed(1)} KB]`;
}

// ===================== Chat Session DAO (JSONL-based) =====================

// ==========================================================================
// JSONL 数据格式说明
// 每个会话一个文件 ~/.cdf-know-clow/sessions/{sessionId}.jsonl
//
// 第 1 行: { session: Session, messages: Message[] }    ← 迁移后的全量数据
// 第 2+ 行: { message: Message }                         ← 后续新增的消息（逐个追加）
//
// readSessionLines 返回所有行的 object 数组，按行序号索引。
// ==========================================================================

/**
 * 从 JSONL 文件中解析会话和消息数据。
 * 第 0 行包含 { session, messages }，后续每行为 { message }。
 */
function parseSessionFile(sessionId: string): { session: Session | null; messages: Message[] } {
  try {
    const lines = FileStorage.readSessionLines(sessionId);
    if (lines.length === 0) return { session: null, messages: [] };

    // 第 0 行：session + 初始消息
    const firstLine = lines[0] as any;
    const session = firstLine.session as Session;
    const initialMessages: Message[] = firstLine.messages || [];

    // 第 1+ 行：后续追加的消息
    const subsequentMessages: Message[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] as any;
      if (line.message) {
        subsequentMessages.push(line.message as Message);
      }
    }

    return { session, messages: [...initialMessages, ...subsequentMessages] };
  } catch {
    return { session: null, messages: [] };
  }
}

// ===================== Session DAO =====================

export function getSessions(): Session[] {
  const sessionIds = FileStorage.listSessionFiles();
  const result: Session[] = [];

  for (const id of sessionIds) {
    // 只读第一行（session 元数据），不全量解析消息
    const firstLine = FileStorage.readSessionFirstLine(id) as any;
    if (firstLine && firstLine.session) {
      const session = { ...firstLine.session } as Session;
      // 用文件修改时间作为 lastActiveAt，避免每次 addMessage 都重写第一行
      const fileMtime = FileStorage.getSessionMtime(id);
      if (fileMtime) {
        session.updatedAt = fileMtime;
        session.lastActiveAt = fileMtime;
      }
      // 消息数：优先用首行缓存的 _cachedMsgCount（由 addMessage 维护），
      // 否则用初始消息数 + 行数差（fallback，需遍历文件）
      const cachedCount = (firstLine as any)._cachedMsgCount;
      if (typeof cachedCount === 'number' && cachedCount >= 0) {
        (session as any).messageCount = cachedCount;
      } else {
        const initialMsgCount = (firstLine.messages || []).length;
        const totalLines = FileStorage.countSessionLines(id);
        (session as any).messageCount = initialMsgCount + Math.max(0, totalLines - 1);
      }
      result.push(session);
    }
  }

  // 按 updatedAt 降序排列
  result.sort((a, b) => {
    const aTime = a.updatedAt || a.createdAt || '';
    const bTime = b.updatedAt || b.createdAt || '';
    return bTime.localeCompare(aTime);
  });

  // 预热最近活跃会话的 OS page cache（仅前 5 个，避免启动时 IO 突发）
  for (let i = 0; i < Math.min(5, result.length); i++) {
    FileStorage.prewarmSessionFile(result[i].id);
  }

  return result;
}

/** 搜索会话（按标题模糊匹配） */
export function searchSessions(query: string): Session[] {
  const all = getSessions();
  const q = query.toLowerCase();
  return all.filter((s) => s.title.toLowerCase().includes(q));
}

export function createSession(
  id: string,
  title: string,
  model: string,
  agentId?: string,
  folderId?: string | null,
  parentSessionId?: string | null,
  tags?: string[]
): Session {
  const now = new Date().toISOString();
  const session: Session = {
    id,
    title,
    model,
    agentId,
    folderId: folderId || null,
    createdAt: now,
    updatedAt: now,
    status: 'active',
    lastActiveAt: now,
    sessionDate: now.split('T')[0],
    parentSessionId: parentSessionId || null,
    tags: JSON.stringify(tags || []),
  } as Session;

  const sessionData = { session, messages: [] };
  FileStorage.appendSessionLine(id, sessionData);
  return session;
}

export function getSessionMessages(sessionId: string): Message[] {
  const { messages } = parseSessionFile(sessionId);
  return messages;
}

export function addMessage(msg: Omit<Message, 'id' | 'timestamp'> & { id?: string }): Message {
  const id = msg.id || uuidv4();
  const now = new Date().toISOString();

  // 限制 toolCalls 和 thinking 大小，避免单条消息占用数百 MB
  const truncatedToolCalls = truncateToolCalls(msg.toolCalls);
  const truncatedThinking = truncateThinking(msg.thinking);

  if (truncatedToolCalls !== msg.toolCalls) {
    const origSize = msg.toolCalls ? Buffer.byteLength(msg.toolCalls, 'utf-8') : 0;
    const newSize = truncatedToolCalls ? Buffer.byteLength(truncatedToolCalls, 'utf-8') : 0;
    logger.warn(
      `[DAO] toolCalls 已截断: ${(origSize / 1024 / 1024).toFixed(2)} MB → ${(newSize / 1024).toFixed(1)} KB (session=${msg.sessionId})`,
    );
  }

  const message: Message = {
    ...msg,
    toolCalls: truncatedToolCalls,
    thinking: truncatedThinking,
    id,
    timestamp: now,
  } as Message;

  // 追加消息到 JSONL（O(1) 操作，不读取/重写已有内容）
  FileStorage.appendSessionLine(msg.sessionId, { message });

  // 不在 addMessage 中更新会话元数据（updatedAt/lastActiveAt），
  // getSessions 用文件 mtime 排序，避免每次消息都重写第一行。
  // 标题生成延后到首次 assistant 回复时，由调用方通过 updateSession 触发。

  return message;
}

export function deleteSession(id: string): void {
  FileStorage.deleteSessionFile(id);
}

/** 更新会话元数据（标题、标签等） */
export function updateSession(
  id: string,
  updates: { title?: string; tags?: string; thinkingLevel?: string }
): void {
  try {
    const firstLine = FileStorage.readSessionFirstLine(id) as any;
    if (!firstLine || !firstLine.session) return;

    if (updates.title !== undefined) {
      firstLine.session.title = updates.title;
    }
    if (updates.tags !== undefined) {
      firstLine.session.tags = updates.tags;
    }
    if (updates.thinkingLevel !== undefined) {
      firstLine.session.thinkingLevel = updates.thinkingLevel;
    }

    // 顺便更新 _cachedMsgCount（搭便车，无需额外 I/O）
    // 这样 getSessions 下次可以直接读首行，无需 countSessionLines 遍历文件
    const lines = FileStorage.readSessionLines(id);
    const initialMsgCount = (lines[0] as any)?.messages?.length || 0;
    let msgCount = initialMsgCount;
    for (let i = 1; i < lines.length; i++) {
      if ((lines[i] as any).message) msgCount++;
    }
    (firstLine as any)._cachedMsgCount = msgCount;

    // 只重写第一行，保留后续消息不变
    FileStorage.rewriteSessionFirstLine(id, firstLine);
  } catch (e) {
    logger.error('[DAO] updateSession 失败:', e);
  }
}

// ===================== Folder DAO (JSON config-based) =====================

const FOLDERS_CONFIG_FILE = 'folders.json';

function readFoldersFromFile(): Folder[] {
  try {
    return FileStorage.readConfig<Folder[]>(FOLDERS_CONFIG_FILE);
  } catch {
    return [];
  }
}

function writeFoldersToFile(folders: Folder[]): void {
  FileStorage.writeConfig(FOLDERS_CONFIG_FILE, folders);
}

export function getFolders(): Folder[] {
  return readFoldersFromFile();
}

export function createFolder(name: string, parentId?: string | null): Folder {
  const id = uuidv4();
  const now = new Date().toISOString();
  const folders = readFoldersFromFile();
  const maxSort = folders
    .filter((f) => f.parentId === (parentId || null))
    .reduce((max, f) => Math.max(max, f.sortOrder), -1);
  const sortOrder = maxSort + 1;
  const folder: Folder = {
    id,
    name,
    parentId: parentId || null,
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  folders.push(folder);
  writeFoldersToFile(folders);
  return folder;
}

export function updateFolder(id: string, name: string): Folder | undefined {
  const now = new Date().toISOString();
  const folders = readFoldersFromFile();
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return undefined;
  folders[idx].name = name;
  folders[idx].updatedAt = now;
  writeFoldersToFile(folders);
  return folders[idx];
}

export function deleteFolder(id: string): void {
  const folders = readFoldersFromFile();
  const filtered = folders.filter((f) => f.id !== id);
  writeFoldersToFile(filtered);
}

export function moveSessionToFolder(sessionId: string, folderId: string | null): void {
  // folderId 在 firstLine.session 中，只需重写首行，避免全文件读写
  try {
    const firstLine = FileStorage.readSessionFirstLine(sessionId) as any;
    if (!firstLine || !firstLine.session) return;
    firstLine.session.folderId = folderId || null;
    FileStorage.rewriteSessionFirstLine(sessionId, firstLine);
  } catch (e) {
    logger.error('[DAO] moveSessionToFolder 失败:', e);
  }
}

// ===================== Skill Usage Statistics DAO (JSONL-based) =====================

/** 获取单个技能的使用统计 */
export function getSkillUsageStats(skillId: string): { totalUses: number; lastUsedAt: string | null } {
  const sessionIds = FileStorage.listSessionFiles();
  let count = 0;
  let lastUsed: string | null = null;

  for (const id of sessionIds) {
    const { messages } = parseSessionFile(id);
    for (const msg of messages) {
      if ((msg as any).skillId === skillId) {
        count++;
        if (!lastUsed || msg.timestamp > lastUsed) {
          lastUsed = msg.timestamp;
        }
      }
    }
  }

  return { totalUses: count, lastUsedAt: lastUsed };
}

/** 批量获取多个技能的使用统计 */
export function getBatchSkillUsageStats(skillIds: string[]): Map<string, { totalUses: number; lastUsedAt: string | null }> {
  const statsMap = new Map<string, { totalUses: number; lastUsedAt: string | null }>();

  // 初始化所有技能 ID 为 0
  for (const id of skillIds) {
    statsMap.set(id, { totalUses: 0, lastUsedAt: null });
  }

  if (skillIds.length === 0) return statsMap;

  const skillSet = new Set(skillIds);
  const sessionIds = FileStorage.listSessionFiles();

  for (const sid of sessionIds) {
    const { messages } = parseSessionFile(sid);
    for (const msg of messages) {
      const sId = (msg as any).skillId;
      if (sId && skillSet.has(sId)) {
        const current = statsMap.get(sId)!;
        current.totalUses++;
        if (!current.lastUsedAt || msg.timestamp > current.lastUsedAt) {
          current.lastUsedAt = msg.timestamp;
        }
      }
    }
  }

  return statsMap;
}