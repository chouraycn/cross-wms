import { logger } from '../../../logger.js';
import { SessionStore } from './store.js';
import { generateSessionId } from './session-key.js';
import type { SessionMetadata } from './types.js';

export interface ResetOptions {
  keepActive?: boolean;
  keepArchived?: boolean;
  keepSettings?: boolean;
  dryRun?: boolean;
}

export interface ResetResult {
  deletedActive: number;
  deletedArchived: number;
  totalSpaceReclaimed: number;
  errors: string[];
  dryRun: boolean;
  newDefaultSession?: SessionMetadata;
}

export async function resetAllSessions(
  store: SessionStore,
  options: ResetOptions = {}
): Promise<ResetResult> {
  const result: ResetResult = {
    deletedActive: 0,
    deletedArchived: 0,
    totalSpaceReclaimed: 0,
    errors: [],
    dryRun: options.dryRun || false,
  };

  logger.warn('[SessionReset] 开始重置所有会话...');

  try {
    const paths = store.getPaths();
    const maintenance = store.getMaintenance();
    const diskUsage = maintenance.getDiskUsage();

    if (!options.keepActive) {
      logger.info('[SessionReset] 删除活跃会话...');
      const activeResult = store.listSessions({ status: 'active', limit: 10000 });
      for (const session of activeResult.sessions) {
        try {
          if (!options.dryRun) {
            await store.deleteSession(session.id, true);
          }
          result.deletedActive++;
        } catch (err) {
          result.errors.push(`删除失败 ${session.id}: ${String(err)}`);
        }
      }
    }

    if (!options.keepArchived) {
      logger.info('[SessionReset] 删除归档会话...');
      const archivedResult = store.listSessions({ status: 'archived', limit: 10000 });
      for (const session of archivedResult.sessions) {
        try {
          if (!options.dryRun) {
            await store.deleteSession(session.id, true);
          }
          result.deletedArchived++;
        } catch (err) {
          result.errors.push(`删除归档失败 ${session.id}: ${String(err)}`);
        }
      }
    }

    if (options.keepActive) {
      const newSession = store.createSession({
        id: generateSessionId(),
        title: '新对话',
      });
      result.newDefaultSession = newSession;
      logger.info('[SessionReset] 已创建新默认会话:', newSession.id);
    }

    result.totalSpaceReclaimed = diskUsage.totalBytes;

    logger.warn(
      `[SessionReset] 重置完成: active=${result.deletedActive}, ` +
      `archived=${result.deletedArchived}, ` +
      `space=${(result.totalSpaceReclaimed / 1024 / 1024).toFixed(2)}MB`
    );
  } catch (err) {
    result.errors.push(`重置异常: ${String(err)}`);
    logger.error('[SessionReset] 重置异常:', err);
  }

  return result;
}

export async function resetSession(
  store: SessionStore,
  sessionId: string
): Promise<SessionMetadata | null> {
  logger.info('[SessionReset] 重置会话:', sessionId);

  try {
    const existing = store.getMetadata(sessionId);
    if (!existing) {
      logger.warn('[SessionReset] 会话不存在，无法重置:', sessionId);
      return null;
    }

    const newMetadata = store.createSession({
      id: sessionId,
      title: existing.title || '新对话',
      model: existing.model,
      agentId: existing.agentId || undefined,
      folderId: existing.folderId || undefined,
      parentSessionId: existing.parentSessionId || undefined,
      tags: existing.tags,
    });

    logger.info('[SessionReset] 会话已重置:', sessionId);
    return newMetadata;
  } catch (err) {
    logger.error('[SessionReset] 重置会话失败:', sessionId, err);
    return null;
  }
}

export function createNewSessionAsReset(
  store: SessionStore,
  templateSessionId?: string
): SessionMetadata {
  if (templateSessionId) {
    const template = store.getMetadata(templateSessionId);
    if (template) {
      return store.createSession({
        title: `${template.title} (副本)`,
        model: template.model,
        agentId: template.agentId || undefined,
        folderId: template.folderId || undefined,
        tags: template.tags,
      });
    }
  }

  return store.createSession({
    title: '新对话',
  });
}

export async function softResetSession(
  store: SessionStore,
  sessionId: string
): Promise<boolean> {
  logger.info('[SessionReset] 软重置会话（保留元数据，清空消息）:', sessionId);

  try {
    const metadata = store.getMetadata(sessionId);
    if (!metadata) return false;

    const writer = store.getWriter();
    const firstLine = JSON.stringify({
      session: {
        ...metadata,
        messageCount: 0,
        updatedAt: new Date().toISOString(),
      },
      messages: [],
      goals: [],
      artifacts: [],
      targets: [],
      extra: {},
    });

    const result = await writer.writeSessionFile(sessionId, firstLine + '\n');
    if (result.success) {
      store.clearCache();
      logger.info('[SessionReset] 软重置完成:', sessionId);
      return true;
    }

    return false;
  } catch (err) {
    logger.error('[SessionReset] 软重置失败:', sessionId, err);
    return false;
  }
}
