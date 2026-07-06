/**
 * Message Lifecycle Manager — 消息生命周期管理器
 *
 * 追踪消息从创建到送达的完整生命周期，
 * 支持状态转换、超时处理、失败重试和审计日志。
 */

export type MessageLifecyclePhase =
  | 'created'
  | 'queued'
  | 'rendering'
  | 'previewing'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'timed_out'
  | 'suppressed';

export interface LifecycleTransition {
  from: MessageLifecyclePhase;
  to: MessageLifecyclePhase;
  timestamp: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageLifecycleState {
  messageId: string;
  phase: MessageLifecyclePhase;
  createdAt: number;
  updatedAt: number;
  transitions: LifecycleTransition[];
  attemptCount: number;
  maxAttempts: number;
  channelId: string;
  accountId: string;
  recipient: string;
  metadata: Record<string, unknown>;
  lastError?: {
    message: string;
    stack?: string;
    timestamp: number;
  };
}

export interface LifecycleManagerOptions {
  maxAttempts: number;
  maxAgeMs: number;
  enableAuditLog: boolean;
}

export type LifecycleEventHandler = (state: MessageLifecycleState, transition: LifecycleTransition) => void | Promise<void>;

const VALID_TRANSITIONS: Record<MessageLifecyclePhase, MessageLifecyclePhase[]> = {
  created: ['queued', 'cancelled'],
  queued: ['rendering', 'cancelled'],
  rendering: ['previewing', 'failed'],
  previewing: ['sending', 'cancelled'],
  sending: ['sent', 'failed', 'retrying', 'timed_out'],
  sent: ['delivered', 'read', 'failed'],
  delivered: ['read'],
  read: [],
  failed: ['retrying', 'cancelled'],
  retrying: ['sending', 'failed'],
  cancelled: [],
  timed_out: ['retrying', 'cancelled'],
  suppressed: [],
};

export class MessageLifecycleManager {
  private states: Map<string, MessageLifecycleState> = new Map();
  private options: Required<LifecycleManagerOptions>;
  private eventHandlers: Map<string, Set<LifecycleEventHandler>> = new Map();
  private auditLog: LifecycleTransition[] = [];

  constructor(options: Partial<LifecycleManagerOptions> = {}) {
    this.options = {
      maxAttempts: options.maxAttempts ?? 3,
      maxAgeMs: options.maxAgeMs ?? 24 * 60 * 60 * 1000,
      enableAuditLog: options.enableAuditLog ?? false,
    };
  }

  createState(params: {
    messageId: string;
    channelId: string;
    accountId: string;
    recipient: string;
    maxAttempts?: number;
    metadata?: Record<string, unknown>;
  }): MessageLifecycleState {
    const state: MessageLifecycleState = {
      messageId: params.messageId,
      phase: 'created',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      transitions: [],
      attemptCount: 0,
      maxAttempts: params.maxAttempts ?? this.options.maxAttempts,
      channelId: params.channelId,
      accountId: params.accountId,
      recipient: params.recipient,
      metadata: params.metadata ?? {},
    };

    this.states.set(params.messageId, state);
    this.emit('created', state, {
      from: 'created',
      to: 'created',
      timestamp: Date.now(),
    });

    return state;
  }

  getState(messageId: string): MessageLifecycleState | undefined {
    return this.states.get(messageId);
  }

  transition(
    messageId: string,
    toPhase: MessageLifecyclePhase,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): MessageLifecycleState | null {
    const state = this.states.get(messageId);
    if (!state) return null;

    const validTransitions = VALID_TRANSITIONS[state.phase] || [];
    if (!validTransitions.includes(toPhase)) {
      console.warn(
        `Invalid lifecycle transition: ${state.phase} -> ${toPhase} for message ${messageId}`,
      );
      return null;
    }

    const transition: LifecycleTransition = {
      from: state.phase,
      to: toPhase,
      timestamp: Date.now(),
      reason,
      metadata,
    };

    state.transitions.push(transition);
    state.phase = toPhase;
    state.updatedAt = Date.now();

    if (toPhase === 'sending') {
      state.attemptCount++;
    }

    if (toPhase === 'failed' && metadata?.error) {
      state.lastError = {
        message: String(metadata.error),
        timestamp: Date.now(),
      };
    }

    if (this.options.enableAuditLog) {
      this.auditLog.push(transition);
    }

    this.emit(toPhase, state, transition);

    return state;
  }

  markQueued(messageId: string, queueName?: string): MessageLifecycleState | null {
    return this.transition(messageId, 'queued', 'Message added to queue', { queueName });
  }

  markRendering(messageId: string): MessageLifecycleState | null {
    return this.transition(messageId, 'rendering', 'Starting message rendering');
  }

  markPreviewing(messageId: string): MessageLifecycleState | null {
    return this.transition(messageId, 'previewing', 'Message preview ready');
  }

  markSending(messageId: string): MessageLifecycleState | null {
    return this.transition(messageId, 'sending', 'Sending message');
  }

  markSent(messageId: string, receipt?: unknown): MessageLifecycleState | null {
    return this.transition(messageId, 'sent', 'Message sent successfully', { receipt });
  }

  markDelivered(messageId: string): MessageLifecycleState | null {
    return this.transition(messageId, 'delivered', 'Message delivered');
  }

  markRead(messageId: string): MessageLifecycleState | null {
    return this.transition(messageId, 'read', 'Message read by recipient');
  }

  markFailed(messageId: string, error: Error): MessageLifecycleState | null {
    return this.transition(messageId, 'failed', error.message, { error: error.message });
  }

  markRetrying(messageId: string, nextAttemptAt: number): MessageLifecycleState | null {
    return this.transition(messageId, 'retrying', 'Retrying message send', { nextAttemptAt });
  }

  markCancelled(messageId: string, reason?: string): MessageLifecycleState | null {
    return this.transition(messageId, 'cancelled', reason || 'Message cancelled');
  }

  markTimedOut(messageId: string): MessageLifecycleState | null {
    return this.transition(messageId, 'timed_out', 'Message send timed out');
  }

  markSuppressed(messageId: string, reason?: string): MessageLifecycleState | null {
    return this.transition(messageId, 'suppressed', reason || 'Message suppressed by policy');
  }

  canRetry(messageId: string): boolean {
    const state = this.states.get(messageId);
    if (!state) return false;
    return state.attemptCount < state.maxAttempts;
  }

  isFinal(phase: MessageLifecyclePhase): boolean {
    return ['sent', 'delivered', 'read', 'failed', 'cancelled', 'timed_out', 'suppressed'].includes(phase);
  }

  getActiveStates(): MessageLifecycleState[] {
    return Array.from(this.states.values()).filter((s) => !this.isFinal(s.phase));
  }

  getFailedStates(): MessageLifecycleState[] {
    return Array.from(this.states.values()).filter((s) => s.phase === 'failed');
  }

  on(phase: string, handler: LifecycleEventHandler): void {
    if (!this.eventHandlers.has(phase)) {
      this.eventHandlers.set(phase, new Set());
    }
    this.eventHandlers.get(phase)!.add(handler);
  }

  off(phase: string, handler: LifecycleEventHandler): void {
    const handlers = this.eventHandlers.get(phase);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(phase: string, state: MessageLifecycleState, transition: LifecycleTransition): void {
    const handlers = this.eventHandlers.get(phase);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(state, transition);
        } catch (e) {
          console.error('Lifecycle event handler error:', e);
        }
      }
    }

    const allHandlers = this.eventHandlers.get('*');
    if (allHandlers) {
      for (const handler of allHandlers) {
        try {
          handler(state, transition);
        } catch (e) {
          console.error('Lifecycle event handler error:', e);
        }
      }
    }
  }

  cleanupExpired(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, state] of this.states) {
      const age = now - state.createdAt;
      if (age > this.options.maxAgeMs) {
        this.states.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  getStats(): {
    total: number;
    active: number;
    completed: number;
    failed: number;
    byPhase: Record<MessageLifecyclePhase, number>;
  } {
    const states = Array.from(this.states.values());
    const byPhase: Record<string, number> = {};

    for (const state of states) {
      byPhase[state.phase] = (byPhase[state.phase] || 0) + 1;
    }

    const active = states.filter((s) => !this.isFinal(s.phase)).length;
    const completed = states.filter(
      (s) => s.phase === 'sent' || s.phase === 'delivered' || s.phase === 'read',
    ).length;
    const failed = states.filter((s) => s.phase === 'failed').length;

    return {
      total: states.length,
      active,
      completed,
      failed,
      byPhase: byPhase as Record<MessageLifecyclePhase, number>,
    };
  }

  getAuditLog(messageId?: string): LifecycleTransition[] {
    if (messageId) {
      const state = this.states.get(messageId);
      return state ? [...state.transitions] : [];
    }
    return [...this.auditLog];
  }

  clear(): void {
    this.states.clear();
    this.auditLog = [];
  }
}

export const messageLifecycleManager = new MessageLifecycleManager();