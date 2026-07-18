import { logger } from '../../../logger.js';
import { sessionFileExists, archivedSessionFileExists, readSessionFile, readArchivedSessionFile } from './session-file.js';
import { isValidSessionId } from './paths.js';
import type { SessionMetadata, SessionData, TranscriptMessage } from './types.js';
import { SessionDataSchema, SessionMetadataSchema } from './types.js';

export class SessionAccessor {
  private baseDir: string;
  private archivedDir: string;

  constructor(baseDir: string, archivedDir?: string) {
    this.baseDir = baseDir;
    this.archivedDir = archivedDir || baseDir + '-archived';
  }

  exists(sessionId: string, isArchived: boolean = false): boolean {
    if (!isValidSessionId(sessionId)) return false;
    return isArchived
      ? archivedSessionFileExists(this.archivedDir, sessionId)
      : sessionFileExists(this.baseDir, sessionId);
  }

  getMetadata(sessionId: string, isArchived: boolean = false): SessionMetadata | null {
    if (!isValidSessionId(sessionId)) return null;

    const firstLine = isArchived
      ? this.readFirstLineFromArchived(sessionId)
      : this.readFirstLine(sessionId);

    if (!firstLine) return null;

    try {
      const parsed = JSON.parse(firstLine);
      const metadata = parsed.session || parsed.metadata;
      if (!metadata) return null;

      const result = SessionMetadataSchema.safeParse(metadata);
      if (result.success) {
        return result.data;
      }
      logger.warn('[SessionAccessor] 元数据校验失败:', sessionId, result.error.issues);
      return metadata as SessionMetadata;
    } catch {
      return null;
    }
  }

  getSessionData(sessionId: string, isArchived: boolean = false): SessionData | null {
    if (!isValidSessionId(sessionId)) return null;

    const content = isArchived
      ? readArchivedSessionFile(this.archivedDir, sessionId)
      : readSessionFile(this.baseDir, sessionId);

    if (!content) return null;

    try {
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      if (lines.length === 0) return null;

      const firstLine = JSON.parse(lines[0]);
      const metadata = firstLine.session || firstLine.metadata;

      const messages: TranscriptMessage[] = [];
      for (let i = 1; i < lines.length; i++) {
        try {
          const line = JSON.parse(lines[i]);
          if (line.message) {
            messages.push(line.message);
          }
        } catch {
          // skip invalid lines
        }
      }

      const sessionData: SessionData = {
        metadata: SessionMetadataSchema.parse({
          ...metadata,
          messageCount: messages.length,
        }),
        goals: firstLine.goals || [],
        artifacts: firstLine.artifacts || [],
        targets: firstLine.targets || [],
        threadInfo: firstLine.threadInfo,
        extra: firstLine.extra || {},
      };

      return sessionData;
    } catch (err) {
      logger.error('[SessionAccessor] 解析会话数据失败:', sessionId, err);
      return null;
    }
  }

  getMessages(sessionId: string, isArchived: boolean = false): TranscriptMessage[] {
    if (!isValidSessionId(sessionId)) return [];

    const content = isArchived
      ? readArchivedSessionFile(this.archivedDir, sessionId)
      : readSessionFile(this.baseDir, sessionId);

    if (!content) return [];

    try {
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      const messages: TranscriptMessage[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const line = JSON.parse(lines[i]);
          if (line.message) {
            messages.push(line.message);
          }
        } catch {
          // skip invalid lines
        }
      }

      return messages;
    } catch {
      return [];
    }
  }

  getMessageCount(sessionId: string, isArchived: boolean = false): number {
    if (!isValidSessionId(sessionId)) return 0;

    const metadata = this.getMetadata(sessionId, isArchived);
    if (metadata?.messageCount !== undefined && metadata.messageCount > 0) {
      return metadata.messageCount;
    }

    return this.getMessages(sessionId, isArchived).length;
  }

  getMessagesPaged(
    sessionId: string,
    limit: number = 50,
    beforeIndex?: number,
    isArchived: boolean = false
  ): { messages: TranscriptMessage[]; hasMore: boolean; totalCount: number } {
    const allMessages = this.getMessages(sessionId, isArchived);
    const totalCount = allMessages.length;

    let endIndex = beforeIndex !== undefined ? beforeIndex : allMessages.length;
    endIndex = Math.min(endIndex, allMessages.length);
    const startIndex = Math.max(0, endIndex - limit);

    const messages = allMessages.slice(startIndex, endIndex);
    const hasMore = startIndex > 0;

    return { messages, hasMore, totalCount };
  }

  searchMessages(
    sessionId: string,
    query: string,
    isArchived: boolean = false
  ): Array<{ message: TranscriptMessage; index: number }> {
    if (!query || !query.trim()) return [];

    const messages = this.getMessages(sessionId, isArchived);
    const lowerQuery = query.toLowerCase();
    const results: Array<{ message: TranscriptMessage; index: number }> = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.content?.toLowerCase().includes(lowerQuery)) {
        results.push({ message: msg, index: i });
      }
    }

    return results;
  }

  getTags(sessionId: string, isArchived: boolean = false): string[] {
    const metadata = this.getMetadata(sessionId, isArchived);
    return metadata?.tags || [];
  }

  hasTag(sessionId: string, tag: string, isArchived: boolean = false): boolean {
    const tags = this.getTags(sessionId, isArchived);
    return tags.includes(tag);
  }

  private readFirstLine(sessionId: string): string | null {
    const content = readSessionFile(this.baseDir, sessionId);
    if (!content) return null;
    const newlineIndex = content.indexOf('\n');
    return newlineIndex >= 0 ? content.slice(0, newlineIndex) : content;
  }

  private readFirstLineFromArchived(sessionId: string): string | null {
    const content = readArchivedSessionFile(this.archivedDir, sessionId);
    if (!content) return null;
    const newlineIndex = content.indexOf('\n');
    return newlineIndex >= 0 ? content.slice(0, newlineIndex) : content;
  }
}
