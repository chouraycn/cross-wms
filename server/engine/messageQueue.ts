/**
 * MessageQueue — 会话级消息队列与并发控制
 *
 * 解决高频交互中的消息竞争问题，提供三种队列模式：
 *
 * - **Collect**: 合并排队消息为单个 Prompt（适合快速连续输入场景）
 * - **Steer**: 实时插入到当前 Agent 回合（适合需要改变 AI 执行方向时）
 * - **Followup**: 在当前执行完成后串行追加（适合补充信息、追问场景）
 *
 * 核心保证：
 * 1. 会话级串行 — 同一 session 最多 1 个活跃执行
 * 2. 全局并发度控制 — 跨 session 总并发数有上限
 * 3. conversationHistory 后端实时构建 — 消除前端快照不一致
 *
 * v7.0.0: 初始实现
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

/** 队列模式 */
export type QueueMode = 'collect' | 'steer' | 'followup';

/** 队列中单条消息 */
export interface QueuedMessage {
  /** 唯一 ID */
  id: string;
  /** 会话 ID */
  sessionId: string;
  /** 消息文本 */
  content: string;
  /** 队列模式 */
  mode: QueueMode;
  /** 请求体中的附加字段 */
  extra: Record<string, unknown>;
  /** 入队时间戳 */
  enqueuedAt: number;
  /** 关联的 assistantMessageId（前端占位用） */
  assistantMessageId: string;
}

/** 会话执行状态 */
export type SessionState =
  | 'idle'
  | 'executing'
  | 'executing_with_queue'
  | 'steering'
  | 'collecting';

/** 会话级队列状态 */
interface SessionQueue {
  /** 排队消息 */
  queue: QueuedMessage[];
  /** 当前执行的 AbortController */
  currentAbortController: AbortController | null;
  /** 当前执行的消息 ID */
  currentMessageId: string | null;
  /** 当前 assistantMessageId */
  currentAssistantId: string | null;
  /** 当前执行模式 */
  currentMode: QueueMode | null;
  /** 会话状态 */
  state: SessionState;
  /** Collect 窗口定时器 */
  collectTimer: ReturnType<typeof setTimeout> | null;
  /** Collect 合并截止时间 */
  collectDeadline: number | null;
  /** 执行 promise resolve（用于串行等待） */
  executionResolve: (() => void) | null;
  /** 执行 promise（用于串行等待） */
  executionPromise: Promise<void> | null;
  /** 最后活跃时间戳（用于空闲清理） */
  lastActiveAt: number;
}

/** 队列事件 */
export interface QueueEvent {
  type: 'enqueued' | 'dequeued' | 'executing' | 'completed' | 'steering' | 'collecting' | 'merged' | 'rejected';
  sessionId: string;
  messageId?: string;
  assistantMessageId?: string;
  mode?: QueueMode;
  queueLength?: number;
  state?: SessionState;
  reason?: string;
  mergedContent?: string;
}

/** 队列配置 */
export interface MessageQueueConfig {
  /** 全局最大并发执行数（跨 session） */
  maxGlobalConcurrency: number;
  /** Collect 模式合并窗口（ms），在此时间窗口内的消息会被合并 */
  collectWindowMs: number;
  /** Collect 最长等待时间（ms），超时后即使只有一条消息也立即执行 */
  collectMaxWaitMs: number;
  /** Steer 模式下，是否在下一轮 ReAct 循环注入（而非中断当前 LLM 调用） */
  steerSoftInterrupt: boolean;
  /** 队列最大长度（单 session），超出的消息被拒绝 */
  maxQueueLength: number;
  /** 空闲 session 清理超时（ms） */
  idleCleanupMs: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: MessageQueueConfig = {
  maxGlobalConcurrency: 4,
  collectWindowMs: 800,
  collectMaxWaitMs: 3000,
  steerSoftInterrupt: true,
  maxQueueLength: 10,
  idleCleanupMs: 30 * 60 * 1000, // 30 分钟
};

// ===================== MessageQueue 核心类 =====================

export class MessageQueue extends EventEmitter {
  private sessions = new Map<string, SessionQueue>();
  private config: MessageQueueConfig;
  private activeCount = 0;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<MessageQueueConfig>) {
    super();
    this.setMaxListeners(50);
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===================== 公开 API =====================

  /**
   * 启动队列（开始空闲清理定时器等）
   */
  start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanupIdleSessions(), 60_000);
  }

  /**
   * 停止队列
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 入队消息 — 核心入口
   *
   * 根据 mode 决定消息如何处理：
   * - followup: 排队等待当前执行完成后追加
   * - steer: 中断当前执行（soft/hard），注入转向消息
   * - collect: 进入合并窗口，等待更多消息
   *
   * @returns 入队结果（包含 assistantMessageId 供前端占位）
   */
  enqueue(
    sessionId: string,
    content: string,
    mode: QueueMode,
    extra: Record<string, unknown> = {},
  ): { accepted: boolean; messageId: string; assistantMessageId: string; reason?: string } {
    const sq = this.getOrCreateSession(sessionId);
    sq.lastActiveAt = Date.now();
    if (sq.queue.length >= this.config.maxQueueLength) {
      this.emitEvent('rejected', sessionId, { reason: 'queue_full' });
      return {
        accepted: false,
        messageId: '',
        assistantMessageId: '',
        reason: '队列已满，请等待当前操作完成',
      };
    }

    const messageId = uuidv4();
    const assistantMessageId = uuidv4();

    const msg: QueuedMessage = {
      id: messageId,
      sessionId,
      content,
      mode,
      extra,
      enqueuedAt: Date.now(),
      assistantMessageId,
    };

    // 根据当前会话状态 + 消息模式决定处理策略
    if (sq.state === 'idle') {
      // 无活跃执行 → 直接入队并开始执行
      sq.queue.push(msg);
      this.emitEvent('enqueued', sessionId, {
        messageId,
        assistantMessageId,
        mode,
        queueLength: sq.queue.length,
      });
      this.scheduleExecution(sessionId);
    } else if (mode === 'steer') {
      // Steer: 中断当前执行
      this.handleSteer(sessionId, msg, sq);
    } else if (mode === 'collect') {
      // Collect: 进入合并窗口
      this.handleCollect(sessionId, msg, sq);
    } else {
      // Followup (默认): 排队等待
      sq.queue.push(msg);
      sq.state = 'executing_with_queue';
      this.emitEvent('enqueued', sessionId, {
        messageId,
        assistantMessageId,
        mode,
        queueLength: sq.queue.length,
        state: sq.state,
      });
    }

    return { accepted: true, messageId, assistantMessageId };
  }

  /**
   * 获取会话当前状态
   */
  getSessionState(sessionId: string): SessionState {
    return this.sessions.get(sessionId)?.state ?? 'idle';
  }

  /**
   * 获取会话当前排队的消息数
   */
  getQueueLength(sessionId: string): number {
    return this.sessions.get(sessionId)?.queue.length ?? 0;
  }

  /**
   * 获取会话当前的 AbortController（用于 Steer 中断）
   */
  getCurrentAbortController(sessionId: string): AbortController | null {
    return this.sessions.get(sessionId)?.currentAbortController ?? null;
  }

  /**
   * 获取会话当前执行的 assistantMessageId
   */
  getCurrentAssistantId(sessionId: string): string | null {
    return this.sessions.get(sessionId)?.currentAssistantId ?? null;
  }

  /**
   * 标记会话执行完成 — 由 chat route 在策略执行完成后调用
   */
  markCompleted(sessionId: string): void {
    const sq = this.sessions.get(sessionId);
    if (!sq) return;

    sq.currentAbortController = null;
    sq.currentMessageId = null;
    sq.currentAssistantId = null;
    sq.currentMode = null;
    sq.lastActiveAt = Date.now();
    this.activeCount = Math.max(0, this.activeCount - 1);

    // 如果有排队消息，继续执行
    if (sq.queue.length > 0) {
      this.scheduleExecution(sessionId);
    } else {
      sq.state = 'idle';
      // 通知串行等待的 promise
      if (sq.executionResolve) {
        sq.executionResolve();
        sq.executionResolve = null;
        sq.executionPromise = null;
      }
    }
  }

  /**
   * 取消会话中所有排队消息
   */
  cancelAll(sessionId: string): number {
    const sq = this.sessions.get(sessionId);
    if (!sq) return 0;
    const count = sq.queue.length;
    sq.queue = [];
    // 如果有活跃执行，中断它
    if (sq.currentAbortController) {
      sq.currentAbortController.abort();
    }
    this.markCompleted(sessionId);
    return count;
  }

  /**
   * 获取全局活跃执行数
   */
  getActiveCount(): number {
    return this.activeCount;
  }

  /**
   * 检查是否可以接受新的全局执行（并发度控制）
   */
  canAcceptGlobal(): boolean {
    return this.activeCount < this.config.maxGlobalConcurrency;
  }

  // ===================== 内部方法 =====================

  private getOrCreateSession(sessionId: string): SessionQueue {
    let sq = this.sessions.get(sessionId);
    if (!sq) {
      sq = {
        queue: [],
        currentAbortController: null,
        currentMessageId: null,
        currentAssistantId: null,
        currentMode: null,
        state: 'idle',
        collectTimer: null,
        collectDeadline: null,
        executionResolve: null,
        executionPromise: null,
        lastActiveAt: Date.now(),
      };
      this.sessions.set(sessionId, sq);
    }
    return sq;
  }

  /**
   * Steer 处理 — 中断当前执行并注入转向消息
   */
  private handleSteer(sessionId: string, msg: QueuedMessage, sq: SessionQueue): void {
    // 清除 collect 窗口定时器（如果有的话）
    if (sq.collectTimer) {
      clearTimeout(sq.collectTimer);
      sq.collectTimer = null;
      sq.collectDeadline = null;
    }

    // 合并队列中已有的 collect/followup 消息到 steer 消息前
    const pendingMessages = sq.queue.splice(0);
    if (pendingMessages.length > 0) {
      const merged = pendingMessages.map(m => m.content).join('\n');
      msg.content = `${merged}\n---\n[转向指令] ${msg.content}`;
    }

    sq.state = 'steering';
    sq.queue.unshift(msg); // steer 消息优先

    // 中断当前执行
    if (sq.currentAbortController && this.config.steerSoftInterrupt) {
      // 软中断：设置标志，让 ReAct 循环在下一轮检查
      // 实际中断由 chat route 中的 steer 检查逻辑处理
      this.emitEvent('steering', sessionId, {
        messageId: msg.id,
        assistantMessageId: msg.assistantMessageId,
        mode: 'steer',
        state: sq.state,
      });
      // 同时也 abort，让当前 SSE 流结束
      sq.currentAbortController.abort();
    } else if (sq.currentAbortController) {
      // 硬中断
      sq.currentAbortController.abort();
      this.emitEvent('steering', sessionId, {
        messageId: msg.id,
        assistantMessageId: msg.assistantMessageId,
        mode: 'steer',
        state: sq.state,
      });
    }
  }

  /**
   * Collect 处理 — 进入合并窗口
   */
  private handleCollect(sessionId: string, msg: QueuedMessage, sq: SessionQueue): void {
    sq.queue.push(msg);

    // 如果还没有 collect 窗口，启动一个
    if (!sq.collectTimer) {
      sq.state = 'collecting';
      sq.collectDeadline = Date.now() + this.config.collectMaxWaitMs;

      // 窗口定时器：在 collectWindowMs 后检查是否有足够消息
      sq.collectTimer = setTimeout(() => {
        this.flushCollectWindow(sessionId);
      }, this.config.collectWindowMs);
    } else {
      // 已在 collect 窗口中，检查是否达到最长等待时间
      if (Date.now() >= (sq.collectDeadline ?? 0)) {
        this.flushCollectWindow(sessionId);
      }
    }

    this.emitEvent('collecting', sessionId, {
      messageId: msg.id,
      assistantMessageId: msg.assistantMessageId,
      mode: 'collect',
      queueLength: sq.queue.length,
      state: sq.state,
    });
  }

  /**
   * 刷新 Collect 窗口 — 合并消息并执行
   */
  private flushCollectWindow(sessionId: string): void {
    const sq = this.sessions.get(sessionId);
    if (!sq || sq.queue.length === 0) return;

    // 清除定时器
    if (sq.collectTimer) {
      clearTimeout(sq.collectTimer);
      sq.collectTimer = null;
      sq.collectDeadline = null;
    }

    // 合并队列中所有 collect 消息为单个 prompt
    const collectMessages = sq.queue.filter(m => m.mode === 'collect');
    const otherMessages = sq.queue.filter(m => m.mode !== 'collect');

    if (collectMessages.length === 0) {
      sq.queue = otherMessages;
      if (sq.state === 'idle' || sq.state === 'collecting') {
        this.scheduleExecution(sessionId);
      }
      return;
    }

    // 合并：用分隔符连接多条消息
    const mergedContent = collectMessages.map((m, i) => `[输入 ${i + 1}] ${m.content}`).join('\n\n');
    const mergedMessage: QueuedMessage = {
      id: uuidv4(),
      sessionId,
      content: mergedContent,
      mode: 'collect',
      extra: { ...collectMessages[0].extra, mergedFrom: collectMessages.map(m => m.id) },
      enqueuedAt: collectMessages[0].enqueuedAt,
      assistantMessageId: collectMessages[0].assistantMessageId, // 使用第一条的 assistantMessageId
    };

    sq.queue = [mergedMessage, ...otherMessages];

    this.emitEvent('merged', sessionId, {
      messageId: mergedMessage.id,
      assistantMessageId: mergedMessage.assistantMessageId,
      mode: 'collect',
      mergedContent,
      queueLength: sq.queue.length,
    });

    // 如果当前空闲，立即执行
    if (sq.state === 'idle' || sq.state === 'collecting') {
      this.scheduleExecution(sessionId);
    }
  }

  /**
   * 调度执行 — 从队列取出下一条消息并执行
   *
   * 保证会话级串行：如果当前有活跃执行，等待它完成后再执行下一条
   */
  private async scheduleExecution(sessionId: string): Promise<void> {
    const sq = this.sessions.get(sessionId);
    if (!sq || sq.queue.length === 0) return;

    // 全局并发度检查
    if (!this.canAcceptGlobal()) {
      // 延迟重试
      setTimeout(() => this.scheduleExecution(sessionId), 200);
      return;
    }

    // 如果当前有活跃执行，等待完成
    if (sq.state !== 'idle' && sq.state !== 'collecting') {
      if (!sq.executionPromise) {
        sq.executionPromise = new Promise<void>(resolve => {
          sq.executionResolve = resolve;
        });
      }
      await sq.executionPromise;
      // 执行完成后再次检查
      if (sq.queue.length === 0) return;
    }

    // 取出队首消息
    const msg = sq.queue.shift()!;
    sq.currentMessageId = msg.id;
    sq.currentAssistantId = msg.assistantMessageId;
    sq.currentMode = msg.mode;
    sq.currentAbortController = new AbortController();
    sq.state = 'executing';
    this.activeCount++;

    this.emitEvent('dequeued', sessionId, {
      messageId: msg.id,
      assistantMessageId: msg.assistantMessageId,
      mode: msg.mode,
      queueLength: sq.queue.length,
      state: sq.state,
    });

    // 通知外部执行（chat route 监听此事件来启动策略执行）
    this.emitEvent('executing', sessionId, {
      messageId: msg.id,
      assistantMessageId: msg.assistantMessageId,
      mode: msg.mode,
      queueLength: sq.queue.length,
      state: sq.state,
    });
  }

  /**
   * 清理长时间空闲的会话
   */
  private cleanupIdleSessions(): void {
    const now = Date.now();
    for (const [sessionId, sq] of this.sessions) {
      if (
        sq.state === 'idle' &&
        sq.queue.length === 0 &&
        sq.executionPromise === null &&
        now - sq.lastActiveAt > this.config.idleCleanupMs
      ) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * 发射队列事件
   */
  private emitEvent(type: QueueEvent['type'], sessionId: string, extra: Partial<QueueEvent> = {}): void {
    const event: QueueEvent = {
      type,
      sessionId,
      ...extra,
    };
    try {
      this.emit('queue', event);
    } catch (err) {
      logger.error(`[MessageQueue] 事件发射失败:`, err);
    }
  }
}

// ===================== 全局单例 =====================

/** 全局消息队列实例 */
export const messageQueue = new MessageQueue();
