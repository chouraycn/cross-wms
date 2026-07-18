import { EventEmitter } from 'node:events';
import { logger } from '../../logger.js';

export type AgentEventMap = {
  'agent:start': { agentId: string; timestamp: number };
  'agent:stop': { agentId: string; timestamp: number; reason?: string };
  'agent:error': { agentId: string; error: Error; timestamp: number };
  'task:start': { taskId: string; agentId: string; timestamp: number };
  'task:complete': { taskId: string; agentId: string; timestamp: number; result?: unknown };
  'task:error': { taskId: string; agentId: string; error: Error; timestamp: number };
  'task:progress': { taskId: string; agentId: string; progress: number; message?: string; timestamp: number };
  'tool:call': { toolName: string; input: unknown; timestamp: number };
  'tool:result': { toolName: string; result: unknown; timestamp: number };
  'tool:error': { toolName: string; error: Error; timestamp: number };
  'message:sent': { messageId: string; role: string; timestamp: number };
  'message:received': { messageId: string; role: string; timestamp: number };
  [key: string]: unknown;
};

type EventKey = keyof AgentEventMap;

export class AgentEventBus {
  private emitter: EventEmitter;
  private eventLog: { type: string; data: unknown; timestamp: number }[] = [];
  private maxLogSize: number;

  constructor(maxLogSize = 1000) {
    this.emitter = new EventEmitter();
    this.emitter.setMaxListeners(100);
    this.maxLogSize = maxLogSize;
  }

  on<K extends EventKey>(event: K, listener: (data: AgentEventMap[K]) => void): () => void {
    this.emitter.on(event as string, listener);
    return () => this.emitter.off(event as string, listener);
  }

  once<K extends EventKey>(event: K, listener: (data: AgentEventMap[K]) => void): () => void {
    this.emitter.once(event as string, listener);
    return () => this.emitter.off(event as string, listener);
  }

  off<K extends EventKey>(event: K, listener: (data: AgentEventMap[K]) => void): void {
    this.emitter.off(event as string, listener);
  }

  emit<K extends EventKey>(event: K, data: AgentEventMap[K]): void {
    const timestamp = Date.now();
    const eventData = { ...(data as Record<string, unknown>), timestamp } as unknown as AgentEventMap[K];
    
    this.logEvent(event as string, eventData);
    
    try {
      this.emitter.emit(event as string, eventData);
    } catch (err) {
      logger.error(`[AgentEvents] Error in event listener for ${event}: ${err}`);
    }
  }

  private logEvent(type: string, data: unknown): void {
    this.eventLog.push({ type, data, timestamp: Date.now() });
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog.shift();
    }
  }

  getEventLog(): { type: string; data: unknown; timestamp: number }[] {
    return [...this.eventLog];
  }

  clearLog(): void {
    this.eventLog = [];
  }

  getListenerCount(event: EventKey): number {
    return this.emitter.listenerCount(event as string);
  }

  removeAllListeners(event?: EventKey): void {
    if (event) {
      this.emitter.removeAllListeners(event as string);
    } else {
      this.emitter.removeAllListeners();
    }
  }

  waitFor<K extends EventKey>(event: K, timeoutMs = 30_000): Promise<AgentEventMap[K]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeoutMs);

      this.once(event, (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  }
}

export const agentEventBus = new AgentEventBus();
