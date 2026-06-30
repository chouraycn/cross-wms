import { logger } from '../../logger.js';
import type {
  AgentMessage,
  TranscriptRewriteRequest,
  TranscriptRewriteResult,
  TranscriptRewriteReplacement,
} from './types.js';

interface RewriteHistoryEntry {
  timestamp: number;
  replacements: TranscriptRewriteReplacement[];
  originalMessages: Map<string, AgentMessage>;
  bytesFreed: number;
}

export class TranscriptRewriteManager {
  private messages: AgentMessage[];
  private history: RewriteHistoryEntry[] = [];
  private maxHistorySize: number = 20;

  constructor(messages: AgentMessage[]) {
    this.messages = [...messages];
  }

  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  getHistoryCount(): number {
    return this.history.length;
  }

  async rewrite(request: TranscriptRewriteRequest): Promise<TranscriptRewriteResult> {
    logger.debug('[TranscriptRewrite] 开始重写请求，替换条目数:', request.replacements.length);

    const validationError = validateRewriteRequest(request, this.messages);
    if (validationError) {
      logger.warn('[TranscriptRewrite] 重写请求验证失败:', validationError);
      return {
        changed: false,
        bytesFreed: 0,
        rewrittenEntries: 0,
        reason: validationError,
      };
    }

    const workingCopy = [...this.messages];
    const originalMessages = new Map<string, AgentMessage>();
    const entryIdToIndex = new Map<string, number>();

    for (let i = 0; i < workingCopy.length; i++) {
      const msg = workingCopy[i];
      if (msg.id) {
        entryIdToIndex.set(msg.id, i);
      }
    }

    for (const replacement of request.replacements) {
      const idx = entryIdToIndex.get(replacement.entryId);
      if (idx !== undefined) {
        originalMessages.set(replacement.entryId, { ...workingCopy[idx] });
        workingCopy[idx] = { ...replacement.message };
      }
    }

    const integrityError = this.verifyIntegrity(workingCopy);
    if (integrityError) {
      logger.error('[TranscriptRewrite] 重写后完整性验证失败:', integrityError);
      return {
        changed: false,
        bytesFreed: 0,
        rewrittenEntries: 0,
        reason: `integrity_check_failed: ${integrityError}`,
      };
    }

    const bytesFreed = computeBytesFreed(this.messages, workingCopy);

    const historyEntry: RewriteHistoryEntry = {
      timestamp: Date.now(),
      replacements: request.replacements.map(r => ({
        entryId: r.entryId,
        message: { ...r.message },
      })),
      originalMessages,
      bytesFreed,
    };

    this.pushHistory(historyEntry);

    this.messages = workingCopy;

    logger.info(
      '[TranscriptRewrite] 重写完成，替换条目:',
      request.replacements.length,
      '释放字节:',
      bytesFreed
    );

    return {
      changed: true,
      bytesFreed,
      rewrittenEntries: request.replacements.length,
    };
  }

  undo(): TranscriptRewriteResult | null {
    const lastEntry = this.history.pop();
    if (!lastEntry) {
      logger.debug('[TranscriptRewrite] 无可撤销的重写历史');
      return null;
    }

    const workingCopy = [...this.messages];
    const entryIdToIndex = new Map<string, number>();

    for (let i = 0; i < workingCopy.length; i++) {
      const msg = workingCopy[i];
      if (msg.id) {
        entryIdToIndex.set(msg.id, i);
      }
    }

    for (const [entryId, originalMsg] of lastEntry.originalMessages) {
      const idx = entryIdToIndex.get(entryId);
      if (idx !== undefined) {
        workingCopy[idx] = { ...originalMsg };
      }
    }

    this.messages = workingCopy;

    logger.info(
      '[TranscriptRewrite] 撤销重写，恢复条目:',
      lastEntry.originalMessages.size,
      '字节变化:',
      -lastEntry.bytesFreed
    );

    return {
      changed: true,
      bytesFreed: -lastEntry.bytesFreed,
      rewrittenEntries: lastEntry.originalMessages.size,
      reason: 'undo',
    };
  }

  private verifyIntegrity(messages: AgentMessage[]): string | null {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (!msg.role) {
        return `message_at_index_${i}_missing_role`;
      }
      if (typeof msg.content !== 'string') {
        return `message_at_index_${i}_invalid_content`;
      }
    }
    return null;
  }

  private pushHistory(entry: RewriteHistoryEntry): void {
    this.history.push(entry);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }
}

export function validateRewriteRequest(
  request: TranscriptRewriteRequest,
  currentMessages: AgentMessage[]
): string | null {
  if (!request.replacements || request.replacements.length === 0) {
    return 'no_replacements_provided';
  }

  const entryIds = new Set<string>();
  const duplicateIds = new Set<string>();

  for (const replacement of request.replacements) {
    if (!replacement.entryId) {
      return 'missing_entry_id';
    }
    if (!replacement.message) {
      return `missing_message_for_entry_${replacement.entryId}`;
    }
    if (!replacement.message.role) {
      return `missing_role_for_entry_${replacement.entryId}`;
    }
    if (typeof replacement.message.content !== 'string') {
      return `invalid_content_for_entry_${replacement.entryId}`;
    }
    if (entryIds.has(replacement.entryId)) {
      duplicateIds.add(replacement.entryId);
    }
    entryIds.add(replacement.entryId);
  }

  if (duplicateIds.size > 0) {
    return `duplicate_entry_ids: ${Array.from(duplicateIds).join(', ')}`;
  }

  const existingIds = new Set<string>();
  for (const msg of currentMessages) {
    if (msg.id) {
      existingIds.add(msg.id);
    }
  }

  const missingIds: string[] = [];
  for (const replacement of request.replacements) {
    if (!existingIds.has(replacement.entryId)) {
      missingIds.push(replacement.entryId);
    }
  }

  if (missingIds.length > 0) {
    return `entry_ids_not_found: ${missingIds.join(', ')}`;
  }

  if (request.allowedRewriteSuffixEntryIds && request.allowedRewriteSuffixEntryIds.length > 0) {
    const suffixSet = new Set(request.allowedRewriteSuffixEntryIds);
    const messageIds: string[] = [];
    for (const msg of currentMessages) {
      if (msg.id) {
        messageIds.push(msg.id);
      }
    }

    let suffixStartIndex = -1;
    for (let i = 0; i < messageIds.length; i++) {
      if (messageIds[i] === request.allowedRewriteSuffixEntryIds[0]) {
        let match = true;
        for (let j = 0; j < request.allowedRewriteSuffixEntryIds.length; j++) {
          if (messageIds[i + j] !== request.allowedRewriteSuffixEntryIds[j]) {
            match = false;
            break;
          }
        }
        if (match && i + request.allowedRewriteSuffixEntryIds.length === messageIds.length) {
          suffixStartIndex = i;
          break;
        }
      }
    }

    if (suffixStartIndex === -1) {
      return 'allowed_rewrite_suffix_not_found_at_end';
    }

    const disallowedRewrites: string[] = [];
    for (const replacement of request.replacements) {
      if (!suffixSet.has(replacement.entryId)) {
        disallowedRewrites.push(replacement.entryId);
      }
    }

    if (disallowedRewrites.length > 0) {
      return `entries_not_in_allowed_suffix: ${disallowedRewrites.join(', ')}`;
    }
  }

  return null;
}

export function computeBytesFreed(
  beforeMessages: AgentMessage[],
  afterMessages: AgentMessage[]
): number {
  const beforeBytes = estimateMessagesBytes(beforeMessages);
  const afterBytes = estimateMessagesBytes(afterMessages);
  const bytesFreed = beforeBytes - afterBytes;
  return Math.max(0, bytesFreed);
}

function estimateMessageBytes(message: AgentMessage): number {
  let bytes = 0;

  if (message.role) {
    bytes += Buffer.byteLength(message.role, 'utf-8');
  }
  if (message.content) {
    bytes += Buffer.byteLength(message.content, 'utf-8');
  }
  if (message.id) {
    bytes += Buffer.byteLength(message.id, 'utf-8');
  }
  if (message.toolCallId) {
    bytes += Buffer.byteLength(message.toolCallId, 'utf-8');
  }
  if (message.toolName) {
    bytes += Buffer.byteLength(message.toolName, 'utf-8');
  }
  if (message.metadata) {
    bytes += Buffer.byteLength(JSON.stringify(message.metadata), 'utf-8');
  }
  if (message.toolCalls && message.toolCalls.length > 0) {
    bytes += Buffer.byteLength(JSON.stringify(message.toolCalls), 'utf-8');
  }

  return bytes;
}

function estimateMessagesBytes(messages: AgentMessage[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateMessageBytes(msg);
  }
  return total;
}

// ===================== 检查点功能 =====================

/** 转录本检查点 */
export interface TranscriptCheckpoint {
  id: string;
  sessionId: string;
  timestamp: number;
  messageCount: number;
  byteCount: number;
  messages: AgentMessage[];
  historyDepth: number;
  description?: string;
}

/**
 * 转录本检查点管理器
 */
export class TranscriptCheckpointManager {
  private checkpoints: Map<string, TranscriptCheckpoint[]> = new Map();
  private maxCheckpointsPerSession: number = 10;

  /**
   * 创建检查点
   */
  createCheckpoint(
    sessionId: string,
    messages: AgentMessage[],
    description?: string,
  ): TranscriptCheckpoint {
    const checkpoint: TranscriptCheckpoint = {
      id: `checkpoint_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      timestamp: Date.now(),
      messageCount: messages.length,
      byteCount: estimateMessagesBytes(messages),
      messages: [...messages],
      historyDepth: 0,
      description,
    };

    let sessionCheckpoints = this.checkpoints.get(sessionId);
    if (!sessionCheckpoints) {
      sessionCheckpoints = [];
      this.checkpoints.set(sessionId, sessionCheckpoints);
    }

    sessionCheckpoints.push(checkpoint);

    // 保持检查点数量限制
    while (sessionCheckpoints.length > this.maxCheckpointsPerSession) {
      sessionCheckpoints.shift();
    }

    logger.debug(
      `[TranscriptCheckpoint] Created checkpoint ${checkpoint.id} for session ${sessionId}`,
    );

    return checkpoint;
  }

  /**
   * 获取最新检查点
   */
  getLatestCheckpoint(sessionId: string): TranscriptCheckpoint | null {
    const checkpoints = this.checkpoints.get(sessionId);
    if (!checkpoints || checkpoints.length === 0) {
      return null;
    }
    return checkpoints[checkpoints.length - 1];
  }

  /**
   * 获取指定检查点
   */
  getCheckpoint(sessionId: string, checkpointId: string): TranscriptCheckpoint | null {
    const checkpoints = this.checkpoints.get(sessionId);
    if (!checkpoints) return null;
    return checkpoints.find(cp => cp.id === checkpointId) ?? null;
  }

  /**
   * 获取所有检查点
   */
  listCheckpoints(sessionId: string): TranscriptCheckpoint[] {
    return this.checkpoints.get(sessionId) ?? [];
  }

  /**
   * 恢复到指定检查点
   */
  restoreCheckpoint(
    sessionId: string,
    checkpointId: string,
  ): { messages: AgentMessage[]; checkpointsRestored: number } | null {
    const checkpoint = this.getCheckpoint(sessionId, checkpointId);
    if (!checkpoint) {
      logger.warn(`[TranscriptCheckpoint] Checkpoint ${checkpointId} not found`);
      return null;
    }

    const sessionCheckpoints = this.checkpoints.get(sessionId)!;
    const currentIndex = sessionCheckpoints.findIndex(cp => cp.id === checkpointId);
    if (currentIndex === -1) return null;

    // 保留当前检查点之后的检查点
    const checkpointsToRestore = sessionCheckpoints.slice(currentIndex);

    logger.info(
      `[TranscriptCheckpoint] Restoring to checkpoint ${checkpointId}, ` +
      `restoring ${checkpointsToRestore.length} checkpoints`,
    );

    return {
      messages: [...checkpoint.messages],
      checkpointsRestored: checkpointsToRestore.length,
    };
  }

  /**
   * 清空会话检查点
   */
  clearCheckpoints(sessionId: string): number {
    const checkpoints = this.checkpoints.get(sessionId);
    if (!checkpoints) return 0;

    const count = checkpoints.length;
    this.checkpoints.delete(sessionId);
    logger.debug(`[TranscriptCheckpoint] Cleared ${count} checkpoints for session ${sessionId}`);
    return count;
  }

  /**
   * 获取会话统计
   */
  getSessionStats(sessionId: string): {
    checkpointCount: number;
    totalBytes: number;
    latestTimestamp: number | null;
  } {
    const checkpoints = this.checkpoints.get(sessionId) ?? [];
    return {
      checkpointCount: checkpoints.length,
      totalBytes: checkpoints.reduce((sum, cp) => sum + cp.byteCount, 0),
      latestTimestamp: checkpoints.length > 0
        ? checkpoints[checkpoints.length - 1].timestamp
        : null,
    };
  }
}

/** 全局检查点管理器 */
let globalCheckpointManager: TranscriptCheckpointManager | null = null;

/**
 * 获取全局检查点管理器
 */
export function getGlobalCheckpointManager(): TranscriptCheckpointManager {
  if (!globalCheckpointManager) {
    globalCheckpointManager = new TranscriptCheckpointManager();
  }
  return globalCheckpointManager;
}

/**
 * 设置全局检查点管理器
 */
export function setGlobalCheckpointManager(manager: TranscriptCheckpointManager): void {
  globalCheckpointManager = manager;
}
