/**
 * Compaction Transcript Management - 转录本管理
 *
 * 管理压缩后的转录本状态和轮换
 */
import { logger } from '../logger.js';

/** 转录本轮换状态 */
export interface TranscriptRotation {
  enabled: boolean;
  rotationIndex: number;
  currentFile: string;
  archivedFiles: string[];
}

/** 转录本检查点 */
export interface CompactionCheckpoint {
  sessionId?: string;
  sessionFile: string;
  position: number;
  messageCount: number;
  tokenCount: number;
  timestamp: number;
  reason: string;
  summary?: string;
}

/** 转录本管理器 */
export class TranscriptManager {
  private checkpoints: Map<string, CompactionCheckpoint[]> = new Map();
  private rotations: Map<string, TranscriptRotation> = new Map();

  /**
   * 创建检查点
   */
  createCheckpoint(checkpoint: CompactionCheckpoint): void {
    const sessionId = checkpoint.sessionId ?? 'unknown';
    const existing = this.checkpoints.get(sessionId) ?? [];
    existing.push(checkpoint);
    this.checkpoints.set(sessionId, existing);
    logger.debug(`[TranscriptManager] Created checkpoint for ${sessionId} at position ${checkpoint.position}`);
  }

  /**
   * 获取最新检查点
   */
  getLatestCheckpoint(sessionId: string): CompactionCheckpoint | null {
    const checkpoints = this.checkpoints.get(sessionId);
    if (!checkpoints || checkpoints.length === 0) {
      return null;
    }
    return checkpoints[checkpoints.length - 1];
  }

  /**
   * 获取所有检查点
   */
  getCheckpoints(sessionId: string): CompactionCheckpoint[] {
    return this.checkpoints.get(sessionId) ?? [];
  }

  /**
   * 清空会话检查点
   */
  clearCheckpoints(sessionId: string): void {
    this.checkpoints.delete(sessionId);
  }

  /**
   * 启用转录本轮换
   */
  enableRotation(sessionId: string, currentFile: string): void {
    this.rotations.set(sessionId, {
      enabled: true,
      rotationIndex: 0,
      currentFile,
      archivedFiles: [],
    });
    logger.debug(`[TranscriptManager] Enabled rotation for ${sessionId}`);
  }

  /**
   * 执行转录本轮换
   */
  rotateTranscript(sessionId: string, newFile: string): void {
    const rotation = this.rotations.get(sessionId);
    if (!rotation) {
      logger.warn(`[TranscriptManager] No rotation enabled for ${sessionId}`);
      return;
    }

    rotation.rotationIndex++;
    rotation.archivedFiles.push(rotation.currentFile);
    rotation.currentFile = newFile;

    logger.info(`[TranscriptManager] Rotated transcript for ${sessionId} to ${newFile}`);
  }

  /**
   * 获取轮换状态
   */
  getRotation(sessionId: string): TranscriptRotation | null {
    return this.rotations.get(sessionId) ?? null;
  }

  /**
   * 检查是否应该轮换
   */
  shouldRotate(
    sessionId: string,
    options: {
      maxMessages?: number;
      maxTokens?: number;
      maxBytes?: number;
    } = {},
  ): boolean {
    const { maxMessages = 1000, maxTokens = 100000 } = options;
    const latestCheckpoint = this.getLatestCheckpoint(sessionId);

    if (!latestCheckpoint) {
      return false;
    }

    return (
      latestCheckpoint.messageCount > maxMessages ||
      latestCheckpoint.tokenCount > maxTokens
    );
  }

  /**
   * 获取会话统计
   */
  getSessionStats(sessionId: string): {
    checkpointCount: number;
    rotationEnabled: boolean;
    rotationIndex: number;
    archivedCount: number;
  } {
    const checkpoints = this.checkpoints.get(sessionId) ?? [];
    const rotation = this.rotations.get(sessionId);

    return {
      checkpointCount: checkpoints.length,
      rotationEnabled: rotation?.enabled ?? false,
      rotationIndex: rotation?.rotationIndex ?? 0,
      archivedCount: rotation?.archivedFiles.length ?? 0,
    };
  }

  /**
   * 清理会话数据
   */
  cleanupSession(sessionId: string): void {
    this.checkpoints.delete(sessionId);
    this.rotations.delete(sessionId);
    logger.debug(`[TranscriptManager] Cleaned up session data for ${sessionId}`);
  }
}

/** 全局转录本管理器实例 */
let globalTranscriptManager: TranscriptManager | null = null;

/**
 * 获取全局转录本管理器
 */
export function getGlobalTranscriptManager(): TranscriptManager {
  if (!globalTranscriptManager) {
    globalTranscriptManager = new TranscriptManager();
  }
  return globalTranscriptManager;
}

/**
 * 设置全局转录本管理器
 */
export function setGlobalTranscriptManager(manager: TranscriptManager): void {
  globalTranscriptManager = manager;
}

/**
 * 创建转录本管理器
 */
export function createTranscriptManager(): TranscriptManager {
  return new TranscriptManager();
}
