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

// 快照数据结构
export interface Snapshot {
  id: string;
  timestamp: number;
  version: number;
  state: MemoryState;
  eventIndex: number; // 快照对应的事件索引
}

// Memory 状态
export interface MemoryState {
  entries: Map<number, MemoryEntry>;
  lastId: number;
  stats: {
    totalEntries: number;
    lastUpdated: number;
  };
}

// Event sourcing 配置
export interface EventSourcingConfig {
  snapshotInterval?: number; // 每多少个事件创建一次快照
  maxHistorySize?: number; // 最大历史记录数
  enableSnapshots?: boolean; // 是否启用快照
}

// 回放选项
export interface ReplayOptions {
  fromTimestamp?: number;
  toTimestamp?: number;
  eventTypes?: MemoryEventType[];
  onEvent?: (event: MemoryEvent, index: number) => void | Promise<void>;
}

// 回放结果
export interface ReplayResult {
  eventsReplayed: number;
  finalState: MemoryState;
  duration: number;
  errors: Array<{ event: MemoryEvent; error: Error }>;
}

/**
 * Memory 事件总线
 * 支持事件发布订阅、历史记录、事件回放、事件溯源和快照
 */
export class MemoryEventBus extends EventEmitter<MemoryEventBusEvents> {
  private eventHistory: MemoryEvent[] = [];
  private maxHistorySize = 500;
  private listenerMap: Map<MemoryEventType, Set<(event: MemoryEvent) => void>> = new Map();

  // Event sourcing 相关
  private snapshots: Snapshot[] = [];
  private snapshotInterval: number;
  private enableSnapshots: boolean;
  private currentState: MemoryState;
  private currentVersion: number = 0;

  constructor(config: EventSourcingConfig = {}) {
    super();
    this.maxHistorySize = config.maxHistorySize ?? 500;
    this.snapshotInterval = config.snapshotInterval ?? 100;
    this.enableSnapshots = config.enableSnapshots ?? true;

    // 初始化状态
    this.currentState = {
      entries: new Map(),
      lastId: 0,
      stats: {
        totalEntries: 0,
        lastUpdated: Date.now(),
      },
    };
  }

  /**
   * 发送事件并记录历史
   */
  emitEvent(type: MemoryEventType, data?: unknown): void {
    const event: MemoryEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    // 记录历史
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // 更新状态（Event Sourcing）
    this.applyEventToState(event);

    // 通知监听器
    const typeListeners = this.listenerMap.get(type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch {
          // 忽略监听器错误
        }
      }
    }

    // 创建快照
    if (this.enableSnapshots && this.eventHistory.length % this.snapshotInterval === 0) {
      this.createSnapshot();
    }
  }

  /**
   * 将事件应用到状态（Event Sourcing 核心）
   */
  private applyEventToState(event: MemoryEvent): void {
    this.currentVersion++;

    switch (event.type) {
      case 'memory_inserted':
        if (event.data && typeof event.data === 'object') {
          const entry = event.data as MemoryEntry;
          this.currentState.entries.set(entry.id, entry);
          this.currentState.lastId = Math.max(this.currentState.lastId, entry.id);
          this.currentState.stats.totalEntries = this.currentState.entries.size;
          this.currentState.stats.lastUpdated = event.timestamp;
        }
        break;

      case 'memory_updated':
        if (event.data && typeof event.data === 'object') {
          const entry = event.data as MemoryEntry;
          if (this.currentState.entries.has(entry.id)) {
            this.currentState.entries.set(entry.id, entry);
            this.currentState.stats.lastUpdated = event.timestamp;
          }
        }
        break;

      case 'memory_deleted':
        if (typeof event.data === 'number') {
          const id = event.data;
          this.currentState.entries.delete(id);
          this.currentState.stats.totalEntries = this.currentState.entries.size;
          this.currentState.stats.lastUpdated = event.timestamp;
        }
        break;

      case 'cleared':
        this.currentState.entries.clear();
        this.currentState.lastId = 0;
        this.currentState.stats.totalEntries = 0;
        this.currentState.stats.lastUpdated = event.timestamp;
        break;
    }
  }

  /**
   * 创建快照
   */
  createSnapshot(): Snapshot {
    const snapshot: Snapshot = {
      id: `snapshot-${Date.now()}-${this.currentVersion}`,
      timestamp: Date.now(),
      version: this.currentVersion,
      state: {
        entries: new Map(this.currentState.entries),
        lastId: this.currentState.lastId,
        stats: { ...this.currentState.stats },
      },
      eventIndex: this.eventHistory.length - 1,
    };

    this.snapshots.push(snapshot);

    // 限制快照数量
    if (this.snapshots.length > 10) {
      this.snapshots.shift();
    }

    return snapshot;
  }

  /**
   * 从最近的快照重建状态
   */
  rebuildFromSnapshot(): MemoryState {
    if (this.snapshots.length === 0) {
      return this.currentState;
    }

    // 获取最近的有效快照
    const latestSnapshot = this.snapshots[this.snapshots.length - 1];

    // 从快照恢复状态
    this.currentState = {
      entries: new Map(latestSnapshot.state.entries),
      lastId: latestSnapshot.state.lastId,
      stats: { ...latestSnapshot.state.stats },
    };
    this.currentVersion = latestSnapshot.version;

    // 重放快照之后的事件
    const startIndex = latestSnapshot.eventIndex + 1;
    for (let i = startIndex; i < this.eventHistory.length; i++) {
      this.applyEventToState(this.eventHistory[i]);
    }

    return this.currentState;
  }

  /**
   * 事件回放：从头重建状态
   */
  replayEvents(options: ReplayOptions = {}): ReplayResult {
    const startTime = Date.now();
    const errors: Array<{ event: MemoryEvent; error: Error }> = [];

    // 初始化状态
    const initialState: MemoryState = {
      entries: new Map(),
      lastId: 0,
      stats: {
        totalEntries: 0,
        lastUpdated: Date.now(),
      },
    };

    this.currentState = initialState;
    this.currentVersion = 0;

    let eventsReplayed = 0;

    // 过滤事件
    const events = this.eventHistory.filter(event => {
      if (options.fromTimestamp && event.timestamp < options.fromTimestamp) return false;
      if (options.toTimestamp && event.timestamp > options.toTimestamp) return false;
      if (options.eventTypes && !options.eventTypes.includes(event.type)) return false;
      return true;
    });

    // 重放事件
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      try {
        this.applyEventToState(event);
        eventsReplayed++;

        if (options.onEvent) {
          const result = options.onEvent(event, i);
          if (result instanceof Promise) {
            // 简化处理：不等待异步回调
          }
        }
      } catch (error) {
        errors.push({ event, error: error as Error });
      }
    }

    const duration = Date.now() - startTime;

    return {
      eventsReplayed,
      finalState: this.currentState,
      duration,
      errors,
    };
  }

  /**
   * Event Sourcing：从事件流重建状态
   */
  rebuildState(events?: MemoryEvent[]): MemoryState {
    // 如果提供了事件列表，使用它；否则使用历史记录
    const eventList = events || this.eventHistory;

    // 初始化状态
    const state: MemoryState = {
      entries: new Map(),
      lastId: 0,
      stats: {
        totalEntries: 0,
        lastUpdated: Date.now(),
      },
    };

    let version = 0;

    for (const event of eventList) {
      version++;

      switch (event.type) {
        case 'memory_inserted':
          if (event.data && typeof event.data === 'object') {
            const entry = event.data as MemoryEntry;
            state.entries.set(entry.id, entry);
            state.lastId = Math.max(state.lastId, entry.id);
            state.stats.totalEntries = state.entries.size;
            state.stats.lastUpdated = event.timestamp;
          }
          break;

        case 'memory_updated':
          if (event.data && typeof event.data === 'object') {
            const entry = event.data as MemoryEntry;
            if (state.entries.has(entry.id)) {
              state.entries.set(entry.id, entry);
              state.stats.lastUpdated = event.timestamp;
            }
          }
          break;

        case 'memory_deleted':
          if (typeof event.data === 'number') {
            const id = event.data;
            state.entries.delete(id);
            state.stats.totalEntries = state.entries.size;
            state.stats.lastUpdated = event.timestamp;
          }
          break;

        case 'cleared':
          state.entries.clear();
          state.lastId = 0;
          state.stats.totalEntries = 0;
          state.stats.lastUpdated = event.timestamp;
          break;
      }
    }

    this.currentState = state;
    this.currentVersion = version;

    return state;
  }

  /**
   * 获取当前状态
   */
  getCurrentState(): MemoryState {
    return {
      entries: new Map(this.currentState.entries),
      lastId: this.currentState.lastId,
      stats: { ...this.currentState.stats },
    };
  }

  /**
   * 获取当前版本号
   */
  getVersion(): number {
    return this.currentVersion;
  }

  /**
   * 获取快照列表
   */
  getSnapshots(): Snapshot[] {
    return [...this.snapshots];
  }

  /**
   * 获取最近一次快照
   */
  getLatestSnapshot(): Snapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /**
   * 监听事件
   */
  onEvent(type: MemoryEventType, handler: (event: MemoryEvent) => void): () => void {
    if (!this.listenerMap.has(type)) {
      this.listenerMap.set(type, new Set());
    }
    this.listenerMap.get(type)!.add(handler);

    return () => {
      this.listenerMap.get(type)?.delete(handler);
    };
  }

  /**
   * 获取事件历史
   */
  getHistory(limit?: number): MemoryEvent[] {
    const history = [...this.eventHistory];
    return limit ? history.slice(-limit) : history;
  }

  /**
   * 按类型获取事件历史
   */
  getHistoryByType(type: MemoryEventType, limit?: number): MemoryEvent[] {
    const filtered = this.eventHistory.filter((e) => e.type === type);
    return limit ? filtered.slice(-limit) : filtered;
  }

  /**
   * 清除历史
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * 获取事件计数
   */
  getEventCount(type?: MemoryEventType): number {
    if (type) {
      return this.eventHistory.filter((e) => e.type === type).length;
    }
    return this.eventHistory.length;
  }

  /**
   * 获取最后事件
   */
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

  /**
   * 从状态导出事件
   */
  exportStateAsEvents(): MemoryEvent[] {
    const events: MemoryEvent[] = [];

    for (const entry of this.currentState.entries.values()) {
      events.push({
        type: 'memory_inserted',
        timestamp: entry.createdAt,
        data: entry,
      });
    }

    return events.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 重置状态和历史
   */
  reset(): void {
    this.eventHistory = [];
    this.snapshots = [];
    this.currentVersion = 0;
    this.currentState = {
      entries: new Map(),
      lastId: 0,
      stats: {
        totalEntries: 0,
        lastUpdated: Date.now(),
      },
    };
  }
}

export const memoryEventBus = new MemoryEventBus();