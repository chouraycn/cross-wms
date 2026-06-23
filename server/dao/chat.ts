import { v4 as uuidv4 } from 'uuid';
import type { Session, Folder, Message } from '../db.js';
import { logger } from '../logger.js';
import { FileStorage } from '../storage/FileStorage.js';

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
    const { session, messages } = parseSessionFile(id);
    if (session) {
      (session as any).messageCount = messages.length;
      result.push(session);
    }
  }

  // 按 updatedAt 降序排列
  result.sort((a, b) => {
    const aTime = a.updatedAt || a.createdAt || '';
    const bTime = b.updatedAt || b.createdAt || '';
    return bTime.localeCompare(aTime);
  });

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
  const message: Message = {
    ...msg,
    id,
    timestamp: now,
  } as Message;

  // 追加消息到 JSONL
  FileStorage.appendSessionLine(msg.sessionId, { message });

  // 自动更新会话元数据 + 标题生成（同步操作）
  try {
    const lines = FileStorage.readSessionLines(msg.sessionId);
    if (lines.length > 0) {
      const firstLine = lines[0] as any;
      if (firstLine.session) {
        firstLine.session.updatedAt = now;
        firstLine.session.lastActiveAt = now;

        // 首条用户消息自动生成标题
        if (msg.role === 'user') {
          const initialMsgCount = (firstLine.messages || []).length;
          const totalMsgCount = initialMsgCount + (lines.length - 1); // 第 0 行初始消息 + 追加行
          if (totalMsgCount <= 1 && (firstLine.session.title === '新对话' || !firstLine.session.title)) {
            const autoTitle = msg.content.slice(0, 30).replace(/\n/g, ' ').trim() || '新对话';
            firstLine.session.title = autoTitle;
          }
        }

        // 重写第一行（用新数据覆盖）
        // 由于 JSONL 只能追加，删除旧文件后重新写入
        // 保存除第 0 行外的所有消息行
        const subsequentLines = lines.slice(1);
        FileStorage.deleteSessionFile(msg.sessionId);
        FileStorage.appendSessionLine(msg.sessionId, firstLine);
        for (const line of subsequentLines) {
          FileStorage.appendSessionLine(msg.sessionId, line);
        }
      }
    }
  } catch (e) {
    logger.error('[DAO] 更新会话元数据失败:', e);
  }

  return message;
}

export function deleteSession(id: string): void {
  FileStorage.deleteSessionFile(id);
}

/** 更新会话元数据（标题、标签等） */
export function updateSession(
  id: string,
  updates: { title?: string; tags?: string }
): void {
  try {
    const lines = FileStorage.readSessionLines(id);
    if (lines.length === 0) return;
    const firstLine = lines[0] as any;
    if (!firstLine.session) return;

    const now = new Date().toISOString();
    if (updates.title !== undefined) {
      firstLine.session.title = updates.title;
    }
    if (updates.tags !== undefined) {
      firstLine.session.tags = updates.tags;
    }
    firstLine.session.updatedAt = now;

    // 重写文件
    const subsequentLines = lines.slice(1);
    FileStorage.deleteSessionFile(id);
    FileStorage.appendSessionLine(id, firstLine);
    for (const line of subsequentLines) {
      FileStorage.appendSessionLine(id, line);
    }
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
  // 会话存储在 JSONL 中，更新其 folderId 字段
  try {
    const lines = FileStorage.readSessionLines(sessionId);
    if (lines.length === 0) return;
    const firstLine = lines[0] as any;
    if (firstLine.session) {
      firstLine.session.folderId = folderId || null;
      // 重写文件
      const subsequentLines = lines.slice(1);
      FileStorage.deleteSessionFile(sessionId);
      FileStorage.appendSessionLine(sessionId, firstLine);
      for (const line of subsequentLines) {
        FileStorage.appendSessionLine(sessionId, line);
      }
    }
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