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
};

/** 轨迹记录器 flush 诊断信息。 */
export type TrajectoryRecorderDiagnostics = {
  pendingWrites: number;
  queuedBytes: number;
  activeOperation: string;
};

/** 轨迹记录器（参考 openclaw TrajectoryRuntimeRecorder 简化实现）。 */
export class TrajectoryRecorder {
  private step = 0;
  private readonly config: TrajectoryRecorderConfig;
  private pendingLines: string[] = [];
  private queuedBytes = 0;
  private flushQueue: Promise<void> = Promise.resolve();

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

  /** 获取 flush 诊断信息。 */
  describeFlushState(): TrajectoryRecorderDiagnostics {
    return {
      pendingWrites: this.pendingLines.length > 0 ? 1 : 0,
      queuedBytes: this.queuedBytes,
      activeOperation: this.pendingLines.length > 0 ? 'append' : 'idle',
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
