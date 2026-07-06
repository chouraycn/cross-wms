/**
 * 消息生命周期管理
 *
 * 基于 OpenClaw 通道系统的消息生命周期架构，
 * 管理消息从接收、处理到发送的完整生命周期。
 */

import EventEmitter from 'eventemitter3';

export type MessageLifecycleState =
  | 'received'
  | 'queued'
  | 'processing'
  | 'routed'
  | 'generating'
  | 'sending'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'deleted';

export interface MessageLifecycleEvent {
  messageId: string;
  state: MessageLifecycleState;
  timestamp: number;
  data?: Record<string, unknown>;
  error?: string;
  duration?: number;
}

export interface MessageState {
  id: string;
  channelType: string;
  channelName: string;
  direction: 'inbound' | 'outbound';
  content: string;
  contentType: 'text' | 'markdown' | 'json' | 'image';
  state: MessageLifecycleState;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  deliveredAt?: number;
  failedAt?: number;
  errorMessage?: string;
  retries: number;
  maxRetries: number;
  parentMessageId?: string;
  threadId?: string;
  sessionId?: string;
  userId?: string;
}

export interface LifecycleTransition {
  from: MessageLifecycleState;
  to: MessageLifecycleState;
  reason?: string;
}

export const VALID_TRANSITIONS: LifecycleTransition[] = [
  { from: 'received', to: 'queued' },
  { from: 'received', to: 'processing' },
  { from: 'queued', to: 'processing' },
  { from: 'queued', to: 'cancelled' },
  { from: 'processing', to: 'routed' },
  { from: 'processing', to: 'failed' },
  { from: 'routed', to: 'generating' },
  { from: 'generating', to: 'sending' },
  { from: 'generating', to: 'failed' },
  { from: 'sending', to: 'delivered' },
  { from: 'sending', to: 'failed' },
  { from: 'failed', to: 'queued', reason: 'retry' },
  { from: '*', to: 'cancelled' },
  { from: '*', to: 'deleted' },
];

export interface MessageLifecycleManagerEvents {
  state_changed: [event: MessageLifecycleEvent];
  message_created: [message: MessageState];
  message_delivered: [message: MessageState];
  message_failed: [message: MessageState, error: string];
  message_cancelled: [messageId: string];
  lifecycle_error: [messageId: string, error: Error];
}

export class MessageLifecycleManager extends EventEmitter<MessageLifecycleManagerEvents> {
  private messages: Map<string, MessageState> = new Map();
  private stateHistory: Map<string, MessageLifecycleEvent[]> = new Map();
  private maxHistorySize = 100;

  createMessage(params: {
    id?: string;
    channelType: string;
    channelName: string;
    direction: 'inbound' | 'outbound';
    content: string;
    contentType?: 'text' | 'markdown' | 'json' | 'image';
    metadata?: Record<string, unknown>;
    parentMessageId?: string;
    threadId?: string;
    sessionId?: string;
    userId?: string;
    maxRetries?: number;
  }): MessageState {
    const now = Date.now();
    const message: MessageState = {
      id: params.id || `msg_${now}_${Math.random().toString(36).slice(2, 9)}`,
      channelType: params.channelType,
      channelName: params.channelName,
      direction: params.direction,
      content: params.content,
      contentType: params.contentType || 'text',
      state: 'received',
      metadata: params.metadata || {},
      createdAt: now,
      updatedAt: now,
      retries: 0,
      maxRetries: params.maxRetries || 3,
      parentMessageId: params.parentMessageId,
      threadId: params.threadId,
      sessionId: params.sessionId,
      userId: params.userId,
    };

    this.messages.set(message.id, message);
    this.stateHistory.set(message.id, [
      { messageId: message.id, state: 'received', timestamp: now },
    ]);

    this.emit('message_created', message);
    return message;
  }

  transitionState(
    messageId: string,
    newState: MessageLifecycleState,
    data?: Record<string, unknown>,
  ): boolean {
    const message = this.messages.get(messageId);
    if (!message) {
      this.emit('lifecycle_error', messageId, new Error(`Message ${messageId} not found`));
      return false;
    }

    if (!this.isValidTransition(message.state, newState)) {
      this.emit(
        'lifecycle_error',
        messageId,
        new Error(`Invalid transition: ${message.state} -> ${newState}`),
      );
      return false;
    }

    const oldState = message.state;
    message.state = newState;
    message.updatedAt = Date.now();

    if (newState === 'delivered') {
      message.deliveredAt = Date.now();
    }
    if (newState === 'failed' && data?.error) {
      message.failedAt = Date.now();
      message.errorMessage = String(data.error);
    }

    const event: MessageLifecycleEvent = {
      messageId,
      state: newState,
      timestamp: Date.now(),
      data,
      error: data?.error as string,
      duration: Date.now() - message.createdAt,
    };

    const history = this.stateHistory.get(messageId) || [];
    history.push(event);
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    this.stateHistory.set(messageId, history);

    this.emit('state_changed', event);

    if (newState === 'delivered') {
      this.emit('message_delivered', message);
    }
    if (newState === 'failed') {
      this.emit('message_failed', message, message.errorMessage || 'Unknown error');
    }

    return true;
  }

  private isValidTransition(from: MessageLifecycleState, to: MessageLifecycleState): boolean {
    return VALID_TRANSITIONS.some(
      (t) => (t.from === from || t.from === '*') && t.to === to,
    );
  }

  getMessage(messageId: string): MessageState | undefined {
    return this.messages.get(messageId);
  }

  getMessagesByState(state: MessageLifecycleState): MessageState[] {
    return Array.from(this.messages.values()).filter((m) => m.state === state);
  }

  getMessagesBySession(sessionId: string): MessageState[] {
    return Array.from(this.messages.values()).filter((m) => m.sessionId === sessionId);
  }

  getStateHistory(messageId: string): MessageLifecycleEvent[] {
    return this.stateHistory.get(messageId) || [];
  }

  retryMessage(messageId: string): boolean {
    const message = this.messages.get(messageId);
    if (!message) return false;

    if (message.retries >= message.maxRetries) {
      return false;
    }

    message.retries++;
    return this.transitionState(messageId, 'queued', { retry: message.retries });
  }

  cancelMessage(messageId: string): boolean {
    return this.transitionState(messageId, 'cancelled');
  }

  deleteMessage(messageId: string): boolean {
    const existed = this.messages.has(messageId);
    if (existed) {
      this.transitionState(messageId, 'deleted');
      this.messages.delete(messageId);
    }
    return existed;
  }

  getStats(): {
    total: number;
    byState: Record<MessageLifecycleState, number>;
    averageDuration?: number;
    successRate: number;
  } {
    const all = Array.from(this.messages.values());
    const total = all.length;

    const byState = {} as Record<MessageLifecycleState, number>;
    for (const msg of all) {
      byState[msg.state] = (byState[msg.state] || 0) + 1;
    }

    const delivered = all.filter((m) => m.state === 'delivered');
    const failed = all.filter((m) => m.state === 'failed');
    const completed = delivered.length + failed.length;
    const successRate = completed > 0 ? delivered.length / completed : 0;

    const durations = delivered
      .filter((m) => m.deliveredAt)
      .map((m) => m.deliveredAt! - m.createdAt);
    const averageDuration =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : undefined;

    return { total, byState, averageDuration, successRate };
  }

  clear(): void {
    this.messages.clear();
    this.stateHistory.clear();
  }

  size(): number {
    return this.messages.size;
  }
}

export const messageLifecycleManager = new MessageLifecycleManager();
