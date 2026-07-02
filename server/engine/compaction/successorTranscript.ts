/**
 * 后继转录本管理 — 基于 OpenClaw Successor Transcript
 *
 * 核心功能：
 * - 管理转录本链条：原始 → 压缩1 → 压缩2 → ...
 * - 支持分支和回溯
 * - 记录压缩历史和摘要
 */

// ===================== 类型定义 =====================

/** 转录本记录 */
export interface TranscriptRecord {
  /** 转录本 ID */
  transcriptId: string;
  /** 前一个转录本 ID */
  predecessorId: string | null;
  /** 创建时间 */
  createdAt: number;
  /** 消息数量 */
  messageCount: number;
  /** Token 数量 */
  tokenCount: number;
  /** 压缩摘要 */
  summary: string;
  /** 压缩触发方式 */
  trigger: 'manual' | 'budget' | 'overflow' | 'preemptive';
  /** 压缩比例 */
  compressionRatio: number;
}

/** 转录本链 */
export interface TranscriptChain {
  /** 会话键 */
  sessionKey: string;
  /** 转录本链 */
  records: TranscriptRecord[];
  /** 当前活跃转录本 ID */
  activeTranscriptId: string;
}

// ===================== SuccessorTranscriptManager =====================

export class SuccessorTranscriptManager {
  private chains: Map<string, TranscriptChain> = new Map();

  /** 创建初始转录本 */
  createInitialTranscript(sessionKey: string, options: {
    messageCount: number;
    tokenCount: number;
  }): TranscriptRecord {
    const transcriptId = `transcript_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const record: TranscriptRecord = {
      transcriptId,
      predecessorId: null,
      createdAt: Date.now(),
      messageCount: options.messageCount,
      tokenCount: options.tokenCount,
      summary: '',
      trigger: 'manual',
      compressionRatio: 1,
    };

    this.chains.set(sessionKey, {
      sessionKey,
      records: [record],
      activeTranscriptId: transcriptId,
    });

    return record;
  }

  /** 创建后继转录本（压缩后） */
  createSuccessor(sessionKey: string, options: {
    summary: string;
    messageCount: number;
    tokenCount: number;
    trigger: 'manual' | 'budget' | 'overflow' | 'preemptive';
  }): TranscriptRecord | null {
    const chain = this.chains.get(sessionKey);
    if (!chain) return null;

    const predecessor = chain.records[chain.records.length - 1];
    const transcriptId = `transcript_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const compressionRatio = predecessor.tokenCount > 0
      ? options.tokenCount / predecessor.tokenCount
      : 1;

    const record: TranscriptRecord = {
      transcriptId,
      predecessorId: predecessor.transcriptId,
      createdAt: Date.now(),
      messageCount: options.messageCount,
      tokenCount: options.tokenCount,
      summary: options.summary,
      trigger: options.trigger,
      compressionRatio,
    };

    chain.records.push(record);
    chain.activeTranscriptId = transcriptId;

    return record;
  }

  /** 获取转录本链 */
  getChain(sessionKey: string): TranscriptChain | undefined {
    return this.chains.get(sessionKey);
  }

  /** 获取当前活跃转录本 */
  getActiveTranscript(sessionKey: string): TranscriptRecord | undefined {
    const chain = this.chains.get(sessionKey);
    if (!chain) return undefined;
    return chain.records.find((r) => r.transcriptId === chain.activeTranscriptId);
  }

  /** 获取压缩历史 */
  getCompactionHistory(sessionKey: string): TranscriptRecord[] {
    const chain = this.chains.get(sessionKey);
    if (!chain) return [];
    return chain.records.filter((r) => r.predecessorId !== null);
  }

  /** 回溯到指定转录本 */
  revertTo(sessionKey: string, transcriptId: string): boolean {
    const chain = this.chains.get(sessionKey);
    if (!chain) return false;

    const targetIndex = chain.records.findIndex((r) => r.transcriptId === transcriptId);
    if (targetIndex < 0) return false;

    // 截断后续记录
    chain.records = chain.records.slice(0, targetIndex + 1);
    chain.activeTranscriptId = transcriptId;

    return true;
  }

  /** 删除会话的转录本链 */
  deleteChain(sessionKey: string): boolean {
    return this.chains.delete(sessionKey);
  }

  /** 获取所有会话的转录本链数量 */
  getChainCount(): number {
    return this.chains.size;
  }
}
