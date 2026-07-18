/**
 * 轨迹类型定义
 * 定义版本化事件信封、轨迹条目、轨迹记录器等核心类型。
 * 参考 openclaw/src/trajectory/types.ts 对齐实现。
 */
import { appendFile, readFile } from 'node:fs/promises';
import { logger } from '../../logger.js';

// --- 版本化事件信封（参考 openclaw TrajectoryEvent） ---

type TrajectoryEventSource = 'runtime' | 'transcript' | 'export';

/** 序列化的工具定义（附带编译上下文事件捕获）。 */
export type TrajectoryToolDefinition = {
  name: string;
  description?: string;
  parameters?: unknown;
};

/** 版本化事件信封，用于运行时和 transcript 派生的轨迹行。 */
export type TrajectoryEvent = {
  traceSchema: 'cdf-know-trajectory';
  schemaVersion: 1;
  traceId: string;
  source: TrajectoryEventSource;
  type: string;
  ts: string;
  seq: number;
  sourceSeq?: number;
  sessionId: string;
  sessionKey?: string;
  runId?: string;
  workspaceDir?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  entryId?: string;
  parentEntryId?: string | null;
  data?: Record<string, unknown>;
};

/** 轨迹 bundle 清单（写在 events.jsonl 旁）。 */
export type TrajectoryBundleManifest = {
  traceSchema: 'cdf-know-trajectory';
  schemaVersion: 1;
  generatedAt: string;
  traceId: string;
  sessionId: string;
  sessionKey?: string;
  workspaceDir: string;
  leafId: string | null;
  eventCount: number;
  runtimeEventCount: number;
  transcriptEventCount: number;
  sourceFiles: {
    session: string;
    runtime?: string;
  };
  contents?: Array<{
    path: string;
    mediaType: string;
    bytes: number;
  }>;
  supplementalFiles?: string[];
  warnings?: TrajectoryBundleWarning[];
};

/** 解析/导出警告分组（在清单中带样本行号）。 */
export type TrajectoryBundleWarning = {
  source: 'session' | 'runtime';
  code:
    | 'invalid-session-json'
    | 'invalid-session-row'
    | 'incomplete-session-branch'
    | 'cyclic-session-branch'
    | 'invalid-runtime-json'
    | 'invalid-runtime-event';
  count: number;
  rows: number[];
  message: string;
};

// --- 简化条目类型（兼容旧接口） ---

export type TrajectoryStatus = 'started' | 'running' | 'completed' | 'failed' | 'aborted';

export type TrajectoryEntryData = {
  timestamp: number;
  sessionId: string;
  agentId?: string;
  step: number;
  status: TrajectoryStatus;
  type: 'message' | 'tool_call' | 'tool_result' | 'thinking' | 'error' | 'system';
  content: unknown;
  metadata?: Record<string, unknown>;
  durationMs?: number;
  parentStep?: number;
};

/** 轨迹条目。 */
export class TrajectoryEntry {
  readonly data: TrajectoryEntryData;

  constructor(data: TrajectoryEntryData) {
    this.data = data;
  }

  toJSON(): string {
    return JSON.stringify(this.data);
  }

  static fromJSON(json: string): TrajectoryEntry | null {
    try {
      const data = JSON.parse(json) as TrajectoryEntryData;
      return new TrajectoryEntry(data);
    } catch {
      return null;
    }
  }
}

/** 轨迹步骤（用于回放时的类型化步骤）。 */
export type TrajectoryStep = {
  seq: number;
  type: string;
  timestamp: string;
  data?: Record<string, unknown>;
  durationMs?: number;
};

// --- 轨迹记录器 ---

/** 轨迹记录器配置。 */
export type TrajectoryRecorderConfig = {
  sessionId: string;
  sessionKey?: string;
  runId?: string;
  filePath: string;
  workspaceDir?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  /** 是否启用，默认 true */
  enabled?: boolean;
  /** 事件过滤器（函数形式） */
  eventFilter?: (type: string, data?: Record<string, unknown>) => boolean;
  /** 事件过滤配置（声明式） */
  filter?: EventFilter;
  /** 采样配置 */
  sampling?: EventSamplingConfig;
  /** 采样率 (0-1)，默认 1 表示全部记录（已废弃，请使用 sampling） */
  sampleRate?: number;
};

/** 轨迹记录器 flush 诊断信息。 */
export type TrajectoryRecorderDiagnostics = {
  pendingWrites: number;
  queuedBytes: number;
  activeOperation: string;
  totalRecorded: number;
  totalFiltered: number;
  totalSampled: number;
};

/** 轨迹记录器（参考 openclaw TrajectoryRuntimeRecorder 简化实现）。 */
export class TrajectoryRecorder {
  private step = 0;
  private readonly config: TrajectoryRecorderConfig;
  private pendingLines: string[] = [];
  private queuedBytes = 0;
  private flushQueue: Promise<void> = Promise.resolve();
  private totalRecorded = 0;
  private totalFiltered = 0;
  private totalSampled = 0;

  constructor(config: TrajectoryRecorderConfig) {
    this.config = config;
  }

  get enabled(): boolean {
    return this.config.enabled !== false;
  }

  get filePath(): string {
    return this.config.filePath;
  }

  /**
   * 记录一个轨迹事件（版本化信封格式）。
   * 写入是缓冲的，需调用 flush 确保持久化。
   */
  recordEvent(type: string, data?: Record<string, unknown>): void {
    if (!this.enabled) return;

    if (!this.passesFilter(type, data)) {
      this.totalFiltered++;
      return;
    }

    if (!this.passesSampling(type)) {
      this.totalSampled++;
      return;
    }

    const nextSeq = this.step + 1;
    const event: TrajectoryEvent = {
      traceSchema: 'cdf-know-trajectory',
      schemaVersion: 1,
      traceId: this.config.sessionId,
      source: 'runtime',
      type,
      ts: new Date().toISOString(),
      seq: nextSeq,
      sessionId: this.config.sessionId,
      sessionKey: this.config.sessionKey,
      runId: this.config.runId,
      workspaceDir: this.config.workspaceDir,
      provider: this.config.provider,
      modelId: this.config.modelId,
      modelApi: this.config.modelApi,
      data: data ? this.limitPayload(data) : undefined,
    };

    const line = JSON.stringify(event);
    if (!line) return;

    const jsonlLine = `${line}\n`;
    const lineBytes = Buffer.byteLength(jsonlLine, 'utf8');

    this.pendingLines.push(jsonlLine);
    this.queuedBytes += lineBytes;
    this.step = nextSeq;
    this.totalRecorded++;
  }

  /**
   * 记录一个简化条目（兼容旧接口）。
   * 立即追加到文件。
   */
  async record(
    type: TrajectoryEntryData['type'],
    content: unknown,
    metadata?: Record<string, unknown>,
    parentStep?: number,
  ): Promise<TrajectoryEntry> {
    this.step++;
    const entry = new TrajectoryEntry({
      timestamp: Date.now(),
      sessionId: this.config.sessionId,
      step: this.step,
      status: 'running',
      type,
      content,
      metadata,
      parentStep,
    });

    try {
      await appendFile(this.config.filePath, entry.toJSON() + '\n', 'utf-8');
    } catch (err) {
      logger.error(`[Trajectory] Failed to write entry: ${err}`);
    }

    return entry;
  }

  /** 记录会话完成。 */
  async recordCompletion(status: TrajectoryStatus = 'completed'): Promise<void> {
    const entry = new TrajectoryEntry({
      timestamp: Date.now(),
      sessionId: this.config.sessionId,
      step: ++this.step,
      status,
      type: 'system',
      content: { event: 'session_end' },
    });

    try {
      await appendFile(this.config.filePath, entry.toJSON() + '\n', 'utf-8');
    } catch (err) {
      logger.error(`[Trajectory] Failed to write completion: ${err}`);
    }
  }

  /** 将缓冲的事件刷写到文件。 */
  async flush(): Promise<void> {
    if (this.pendingLines.length === 0) {
      await this.flushQueue;
      return;
    }
    const linesToWrite = this.pendingLines;
    this.pendingLines = [];
    this.queuedBytes = 0;
    this.flushQueue = this.flushQueue
      .catch(() => undefined)
      .then(async () => {
        const content = linesToWrite.join('');
        try {
          await appendFile(this.config.filePath, content, 'utf-8');
        } catch (err) {
          logger.error(`[Trajectory] Failed to flush: ${err}`);
        }
      });
    await this.flushQueue;
  }

  /** 读取所有已记录的条目。 */
  async read(): Promise<TrajectoryEntry[]> {
    try {
      const content = await readFile(this.config.filePath, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      return lines
        .map(line => TrajectoryEntry.fromJSON(line))
        .filter((e): e is TrajectoryEntry => e !== null);
    } catch {
      return [];
    }
  }

  /** 获取当前步骤序号。 */
  getStep(): number {
    return this.step;
  }

  /** 检查事件是否通过过滤器。 */
  private passesFilter(type: string, data?: Record<string, unknown>): boolean {
    if (this.config.eventFilter) {
      return this.config.eventFilter(type, data);
    }

    const filter = this.config.filter;
    if (!filter) return true;

    if (filter.includeTypes && filter.includeTypes.length > 0) {
      if (!filter.includeTypes.includes(type)) return false;
    }

    if (filter.excludeTypes && filter.excludeTypes.length > 0) {
      if (filter.excludeTypes.includes(type)) return false;
    }

    if (filter.custom) {
      return filter.custom(type, data);
    }

    return true;
  }

  /** 检查事件是否通过采样。 */
  private passesSampling(type: string): boolean {
    const sampling = this.config.sampling;
    if (sampling) {
      const rate = sampling.byType?.[type] ?? sampling.rate ?? 1;
      if (rate < 1 && Math.random() > rate) {
        return false;
      }
      return true;
    }

    const sampleRate = this.config.sampleRate ?? 1;
    if (sampleRate < 1 && Math.random() > sampleRate) {
      return false;
    }
    return true;
  }

  /** 获取 flush 诊断信息。 */
  describeFlushState(): TrajectoryRecorderDiagnostics {
    return {
      pendingWrites: this.pendingLines.length > 0 ? 1 : 0,
      queuedBytes: this.queuedBytes,
      activeOperation: this.pendingLines.length > 0 ? 'append' : 'idle',
      totalRecorded: this.totalRecorded,
      totalFiltered: this.totalFiltered,
      totalSampled: this.totalSampled,
    };
  }

  // --- payload 限制（参考 openclaw limitTrajectoryPayloadValue 简化实现） ---

  private static readonly DATA_STRING_MAX_CHARS = 32_768;
  private static readonly DATA_ARRAY_MAX_ITEMS = 64;
  private static readonly DATA_OBJECT_MAX_KEYS = 64;
  private static readonly DATA_MAX_DEPTH = 6;

  private limitPayload(data: Record<string, unknown>): Record<string, unknown> {
    const limited = TrajectoryRecorder.limitValue(data, 0, new WeakSet());
    return (typeof limited === 'object' && limited !== null && !Array.isArray(limited))
      ? limited as Record<string, unknown>
      : { truncated: true, reason: 'payload-limit-fallback' };
  }

  private static limitValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
    if (typeof value === 'string') {
      if (value.length > TrajectoryRecorder.DATA_STRING_MAX_CHARS) {
        return { truncated: true, reason: 'field-size-limit', originalChars: value.length };
      }
      return value;
    }
    if (typeof value !== 'object' || value === null) return value;
    if (seen.has(value)) return { truncated: true, reason: 'circular-reference' };
    if (depth >= TrajectoryRecorder.DATA_MAX_DEPTH) {
      return { truncated: true, reason: 'depth-limit' };
    }
    seen.add(value);
    if (Array.isArray(value)) {
      const limited = value
        .slice(0, TrajectoryRecorder.DATA_ARRAY_MAX_ITEMS)
        .map(item => TrajectoryRecorder.limitValue(item, depth + 1, seen));
      if (value.length > TrajectoryRecorder.DATA_ARRAY_MAX_ITEMS) {
        limited.push({ truncated: true, reason: 'array-size-limit', originalLength: value.length });
      }
      seen.delete(value);
      return limited;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const limited: Record<string, unknown> = {};
    for (const key of keys.slice(0, TrajectoryRecorder.DATA_OBJECT_MAX_KEYS)) {
      limited[key] = TrajectoryRecorder.limitValue(record[key], depth + 1, seen);
    }
    if (keys.length > TrajectoryRecorder.DATA_OBJECT_MAX_KEYS) {
      limited['_truncated'] = { truncated: true, reason: 'object-size-limit', originalKeys: keys.length };
    }
    seen.delete(value);
    return limited;
  }
}

// --- 深化类型定义 ---

/** 轨迹记录元数据 */
export type TrajectoryRecordMetadata = {
  traceId: string;
  sessionId: string;
  sessionKey?: string;
  runId?: string;
  workspaceDir?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  agentId?: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  status: TrajectoryStatus;
  eventCount: number;
  errorCount: number;
  toolCallCount: number;
  tags?: string[];
  customFields?: Record<string, string>;
};

/** 轨迹记录（完整的轨迹信息） */
export type TrajectoryRecord = {
  metadata: TrajectoryRecordMetadata;
  events: TrajectoryEvent[];
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

/** 导出选项 */
export type TrajectoryExportOptions = {
  format?: 'jsonl' | 'json' | 'ndjson' | 'csv' | 'markdown' | 'html';
  includeMetadata?: boolean;
  filterByType?: string[];
  excludeTypes?: string[];
  startTime?: Date;
  endTime?: Date;
  prettyPrint?: boolean;
  maxEvents?: number;
  includeData?: boolean;
  redactSensitive?: boolean;
};

/** 导出结果 */
export type TrajectoryExportResult = {
  outputPath: string;
  eventCount: number;
  format: string;
  sizeBytes: number;
  warnings: TrajectoryBundleWarning[];
  durationMs?: number;
};

/** 清理策略类型 */
export type CleanupPolicyType = 'age' | 'size' | 'count' | 'manual';

/** 清理策略 */
export type CleanupPolicy = {
  type: CleanupPolicyType;
  maxAgeDays?: number;
  maxTotalBytes?: number;
  maxSessionCount?: number;
  minSessionsToKeep?: number;
  dryRun?: boolean;
  preserveTags?: string[];
  preservePattern?: RegExp;
};

/** 清理结果 */
export type TrajectoryCleanupResult = {
  deletedSessions: string[];
  freedBytes: number;
  totalSessionsBefore: number;
  totalSessionsAfter: number;
  totalBytesBefore: number;
  totalBytesAfter: number;
  policy: CleanupPolicy;
  errors: Array<{ sessionId: string; error: string }>;
};

/** 会话信息 */
export type TrajectorySessionInfo = {
  sessionId: string;
  directory: string;
  sizeBytes: number;
  modifiedAt: Date;
  createdAt: Date;
  eventCount?: number;
  status?: TrajectoryStatus;
  tags?: string[];
};

/** 元数据搜索条件 */
export type MetadataSearchCriteria = {
  sessionId?: string;
  status?: TrajectoryStatus;
  provider?: string;
  modelId?: string;
  startTimeFrom?: Date;
  startTimeTo?: Date;
  minEventCount?: number;
  maxEventCount?: number;
  tags?: string[];
  customFields?: Record<string, string>;
};

/** 元数据摘要 */
export type TrajectoryMetadataSummary = {
  totalSessions: number;
  totalEvents: number;
  totalBytes: number;
  oldestSession?: string;
  newestSession?: string;
  byStatus: Record<TrajectoryStatus, number>;
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
};

/** 回放选项 */
export type TrajectoryReplayOptions = {
  typeFilter?: string[];
  fromSeq?: number;
  toSeq?: number;
  maxBytes?: number;
  sortByTime?: boolean;
  speed?: number;
  stepByStep?: boolean;
  breakpoints?: number[];
  onEvent?: (event: TrajectoryEvent, index: number) => void | Promise<void>;
  onBreakpoint?: (event: TrajectoryEvent, seq: number) => void | Promise<void>;
};

/** 回放结果 */
export type TrajectoryReplayResult = {
  events: TrajectoryEvent[];
  totalEventCount: number;
  filteredEventCount: number;
  skippedLines: number;
  timeRange: {
    earliest: string | null;
    latest: string | null;
  };
  typeCounts: Record<string, number>;
  currentIndex: number;
  isPaused: boolean;
};

/** 回放控制器 */
export type TrajectoryReplayController = {
  next: () => Promise<TrajectoryEvent | null>;
  prev: () => Promise<TrajectoryEvent | null>;
  goTo: (seq: number) => Promise<TrajectoryEvent | null>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  getCurrent: () => TrajectoryEvent | null;
  getIndex: () => number;
  getTotal: () => number;
  isPaused: () => boolean;
};

/** 运行时写入器诊断 */
export type TrajectoryRuntimeWriterDiagnostics = {
  pendingWrites: number;
  queuedBytes: number;
  activeOperation: 'idle' | 'append' | 'file-replace';
  maxFileBytes?: number;
  maxQueuedBytes?: number;
  yieldBeforeWrite?: boolean;
  activeWriteBytes?: number;
};

/** 运行时写入器 */
export type TrajectoryRuntimeWriter = {
  filePath: string;
  write: (line: string) => 'queued' | 'dropped';
  flush: () => Promise<void>;
  describeQueue?: () => TrajectoryRuntimeWriterDiagnostics;
  nextSourceSeq?: () => number;
};

/** 运行时记录器 */
export type TrajectoryRuntimeRecorder = {
  enabled: true;
  filePath: string;
  recordEvent: (type: string, data?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  describeFlushState: () => string | undefined;
};

/** 事件过滤器（声明式配置） */
export type EventFilter = {
  /** 仅包含这些类型的事件 */
  includeTypes?: string[];
  /** 排除这些类型的事件 */
  excludeTypes?: string[];
  /** 自定义过滤函数 */
  custom?: (type: string, data?: Record<string, unknown>) => boolean;
};

/** 事件采样配置 */
export type EventSamplingConfig = {
  /** 全局采样率 (0-1) */
  rate?: number;
  /** 按事件类型指定采样率 */
  byType?: Record<string, number>;
};

/** 保留规则 */
export type RetentionRule = {
  type: 'age' | 'count' | 'size';
  value: number;
  tags?: string[];
};

/** 轨迹元数据 */
export type TrajectoryMetadata = {
  sessionId: string;
  title?: string;
  description?: string;
  tags?: string[];
  status?: TrajectoryStatus;
  provider?: string;
  modelId?: string;
  eventCount?: number;
  createdAt?: string;
  updatedAt?: string;
  customFields?: Record<string, unknown>;
};

/** 导出格式 */
export type TrajectoryExportFormat = 'jsonl' | 'json' | 'ndjson' | 'csv' | 'markdown' | 'html';

/** 清理会话信息 */
export type CleanupSessionInfo = {
  sessionId: string;
  directory: string;
  sizeBytes: number;
  modifiedAt: Date;
  createdAt: Date;
  eventCount?: number;
  status?: TrajectoryStatus;
  tags?: string[];
};

/** 清理结果 */
export type CleanupResult = {
  deletedCount: number;
  deletedSessions: CleanupSessionInfo[];
  freedBytes: number;
  totalBefore: number;
  totalAfter: number;
  errors: Array<{ sessionId: string; error: string }>;
};
