import EventEmitter from 'eventemitter3';
import type { MemoryEntry, MemoryEvent, MemoryEventType } from './types';

export interface MemoryEventBusEvents {
  memory_inserted: [entry: MemoryEntry];
  memory_updated: [entry: MemoryEntry];
  memory_deleted: [id: number];
  memory_searched: [query: string, results: number];
  cleared: [];
  error: [error: Error];
}

export class MemoryEventBus extends EventEmitter<MemoryEventBusEvents> {
  private eventHistory: MemoryEvent[] = [];
  private maxHistorySize = 500;
  private listenerMap: Map<MemoryEventType, Set<(event: MemoryEvent) => void>> = new Map();

  emitEvent(type: MemoryEventType, data?: unknown): void {
    const event: MemoryEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const typeListeners = this.listenerMap.get(type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch {
        }
      }
    }
  }

  onEvent(type: MemoryEventType, handler: (event: MemoryEvent) => void): () => void {
    if (!this.listenerMap.has(type)) {
      this.listenerMap.set(type, new Set());
    }
    this.listenerMap.get(type)!.add(handler);

    return () => {
      this.listenerMap.get(type)?.delete(handler);
    };
  }

  getHistory(limit?: number): MemoryEvent[] {
    const history = [...this.eventHistory];
    return limit ? history.slice(-limit) : history;
  }

  getHistoryByType(type: MemoryEventType, limit?: number): MemoryEvent[] {
    const filtered = this.eventHistory.filter((e) => e.type === type);
    return limit ? filtered.slice(-limit) : filtered;
  }

  clearHistory(): void {
    this.eventHistory = [];
  }

  getEventCount(type?: MemoryEventType): number {
    if (type) {
      return this.eventHistory.filter((e) => e.type === type).length;
    }
    return this.eventHistory.length;
  }

  getLastEvent(type?: MemoryEventType): MemoryEvent | undefined {
    if (type) {
      for (let i = this.eventHistory.length - 1; i >= 0; i--) {
        if (this.eventHistory[i].type === type) {
          return this.eventHistory[i];
        }
      }
      return undefined;
    }
    return this.eventHistory[this.eventHistory.length - 1];
  }
}

export const memoryEventBus = new MemoryEventBus();
