/**
 * 运行时轨迹记录器
 * 将运行时事件记录到轨迹日志文件中。
 * 参考 openclaw/src/trajectory/runtime.ts 对齐实现。
 */
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger.js';
import {
  TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES,
  TRAJECTORY_RUNTIME_EVENT_MAX_BYTES,
  TRAJECTORY_RUNTIME_FILE_MAX_BYTES,
  resolveTrajectoryFilePath,
  resolveTrajectoryPointerFilePath,
} from './paths.js';
import type { TrajectoryEvent, TrajectoryToolDefinition, TrajectoryRuntimeWriter, TrajectoryRuntimeWriterDiagnostics } from './types.js';

type TrajectoryRuntimeInit = {
  env?: Record<string, string | undefined>;
  maxRuntimeFileBytes?: number;
  runId?: string;
  sessionId: string;
  sessionKey?: string;
  sessionFile?: string;
  provider?: string;
  modelId?: string;
  modelApi?: string | null;
  workspaceDir?: string;
  writer?: TrajectoryRuntimeWriter;
};

const writers = new Map<string, TrajectoryRuntimeWriter>();
const windowFlushes = new Map<string, Promise<void>>();
const MAX_TRAJECTORY_WRITERS = 100;
const TRAJECTORY_RUNTIME_DATA_STRING_MAX_CHARS = 32_768;
const TRAJECTORY_RUNTIME_DATA_ARRAY_MAX_ITEMS = 64;
const TRAJECTORY_RUNTIME_DATA_OBJECT_MAX_KEYS = 64;
const TRAJECTORY_RUNTIME_DATA_MAX_DEPTH = 6;

function writeTrajectoryPointerBestEffort(params: {
  filePath: string;
  sessionFile?: string;
  sessionId: string;
}): void {
  if (!params.sessionFile) {
    return;
  }
  const pointerPath = resolveTrajectoryPointerFilePath(params.sessionFile);
  try {
    const pointerDir = path.resolve(path.dirname(pointerPath));
    try {
      if (fs.lstatSync(pointerDir).isSymbolicLink()) return;
    } catch { /* ignore */ }
    try {
      if (fs.lstatSync(pointerPath).isSymbolicLink()) return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return;
    }
    const fd = fs.openSync(pointerPath, fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_WRONLY, 0o600);
    try {
      fs.writeFileSync(
        fd,
        `${JSON.stringify(
          {
            traceSchema: 'cdf-know-trajectory-pointer',
            schemaVersion: 1,
            sessionId: params.sessionId,
            runtimeFile: params.filePath,
          },
          null,
          2,
        )}\n`,
        'utf8',
      );
      try { fs.fchmodSync(fd, 0o600); } catch { /* ignore */ }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // 指针文件是尽力写入，不影响轨迹记录本身
  }
}

function trimTrajectoryWriterCache(): void {
  while (writers.size >= MAX_TRAJECTORY_WRITERS) {
    const oldestKey = writers.keys().next().value;
    if (!oldestKey) return;
    writers.delete(oldestKey);
  }
}

function truncateOversizedTrajectoryEvent(
  event: TrajectoryEvent,
  line: string,
): string | undefined {
  const bytes = Buffer.byteLength(line, 'utf8');
  if (bytes <= TRAJECTORY_RUNTIME_EVENT_MAX_BYTES) {
    return line;
  }
  const truncated = JSON.stringify({
    ...event,
    data: {
      truncated: true,
      originalBytes: bytes,
      limitBytes: TRAJECTORY_RUNTIME_EVENT_MAX_BYTES,
      reason: 'trajectory-event-size-limit',
    },
  });
  if (truncated && Buffer.byteLength(truncated, 'utf8') <= TRAJECTORY_RUNTIME_EVENT_MAX_BYTES) {
    return truncated;
  }
  return undefined;
}

function truncatedTrajectoryValue(reason: string, details: Record<string, unknown> = {}): unknown {
  return {
    truncated: true,
    reason,
    ...details,
  };
}

export function limitTrajectoryPayloadValue(
  value: unknown,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (typeof value === 'string') {
    if (value.length > TRAJECTORY_RUNTIME_DATA_STRING_MAX_CHARS) {
      return truncatedTrajectoryValue('trajectory-field-size-limit', {
        originalChars: value.length,
        limitChars: TRAJECTORY_RUNTIME_DATA_STRING_MAX_CHARS,
      });
    }
    return value;
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  if (seen.has(value)) {
    return truncatedTrajectoryValue('trajectory-circular-reference');
  }
  if (depth >= TRAJECTORY_RUNTIME_DATA_MAX_DEPTH) {
    return truncatedTrajectoryValue('trajectory-depth-limit', {
      limitDepth: TRAJECTORY_RUNTIME_DATA_MAX_DEPTH,
    });
  }
  seen.add(value);
  if (Array.isArray(value)) {
    const limited = value
      .slice(0, TRAJECTORY_RUNTIME_DATA_ARRAY_MAX_ITEMS)
      .map((item) => limitTrajectoryPayloadValue(item, depth + 1, seen));
    if (value.length > TRAJECTORY_RUNTIME_DATA_ARRAY_MAX_ITEMS) {
      limited.push(
        truncatedTrajectoryValue('trajectory-array-size-limit', {
          originalLength: value.length,
          limitItems: TRAJECTORY_RUNTIME_DATA_ARRAY_MAX_ITEMS,
        }),
      );
    }
    seen.delete(value);
    return limited;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  const limited: Record<string, unknown> = {};
  for (const key of keys.slice(0, TRAJECTORY_RUNTIME_DATA_OBJECT_MAX_KEYS)) {
    limited[key] = limitTrajectoryPayloadValue(record[key], depth + 1, seen);
  }
  if (keys.length > TRAJECTORY_RUNTIME_DATA_OBJECT_MAX_KEYS) {
    limited['_truncated'] = truncatedTrajectoryValue('trajectory-object-size-limit', {
      originalKeys: keys.length,
      limitKeys: TRAJECTORY_RUNTIME_DATA_OBJECT_MAX_KEYS,
    });
  }
  seen.delete(value);
  return limited;
}

function sanitizeTrajectoryPayload(data: Record<string, unknown>): Record<string, unknown> {
  return limitTrajectoryPayloadValue(data) as Record<string, unknown>;
}

function describeTrajectoryWriterFlushState(writer: TrajectoryRuntimeWriter): string | undefined {
  const diagnostics = writer.describeQueue?.();
  if (!diagnostics) return undefined;
  const parts = [
    `pendingWrites=${diagnostics.pendingWrites}`,
    `queuedBytes=${diagnostics.queuedBytes}`,
    `activeOperation=${diagnostics.activeOperation}`,
    `yieldBeforeWrite=${diagnostics.yieldBeforeWrite ?? false}`,
  ];
  if (diagnostics.activeWriteBytes !== undefined) {
    parts.push(`activeWriteBytes=${diagnostics.activeWriteBytes}`);
  }
  if (diagnostics.maxQueuedBytes !== undefined) {
    parts.push(`maxQueuedBytes=${diagnostics.maxQueuedBytes}`);
  }
  if (diagnostics.maxFileBytes !== undefined) {
    parts.push(`maxFileBytes=${diagnostics.maxFileBytes}`);
  }
  return parts.join(' ');
}

function trimJsonlWindow(lines: string[], maxBytes: number): number {
  let bytes = 0;
  for (const line of lines) {
    bytes += Buffer.byteLength(line, 'utf8');
  }
  while (bytes > maxBytes && lines.length > 0) {
    const line = lines.shift();
    if (line !== undefined) {
      bytes -= Buffer.byteLength(line, 'utf8');
    }
  }
  return bytes;
}

function compareTrajectoryWindowLines(left: string, right: string): number {
  const leftEvent = parseTrajectoryWindowLine(left);
  const rightEvent = parseTrajectoryWindowLine(right);
  const byTs = leftEvent.ts - rightEvent.ts;
  if (byTs !== 0) return byTs;
  return leftEvent.seq - rightEvent.seq;
}

function parseTrajectoryWindowLine(line: string): { ts: number; seq: number } {
  try {
    const parsed = JSON.parse(line) as { ts?: unknown; sourceSeq?: unknown; seq?: unknown };
    const ts = typeof parsed.ts === 'string' ? Date.parse(parsed.ts) : Number.POSITIVE_INFINITY;
    const sourceSeq = typeof parsed.sourceSeq === 'number' ? parsed.sourceSeq : undefined;
    const seq = typeof parsed.seq === 'number' ? parsed.seq : undefined;
    return {
      ts: Number.isFinite(ts) ? ts : Number.POSITIVE_INFINITY,
      seq: sourceSeq ?? seq ?? Number.POSITIVE_INFINITY,
    };
  } catch {
    return { ts: Number.POSITIVE_INFINITY, seq: Number.POSITIVE_INFINITY };
  }
}

function readMaxTrajectorySourceSeq(filePath: string): number {
  return readTrajectoryWindowLines(filePath, TRAJECTORY_RUNTIME_FILE_MAX_BYTES).reduce(
    (max, line) => {
      try {
        const parsed = JSON.parse(line) as { sourceSeq?: unknown; seq?: unknown };
        const seq =
          typeof parsed.sourceSeq === 'number'
            ? parsed.sourceSeq
            : typeof parsed.seq === 'number'
              ? parsed.seq
              : 0;
        return Math.max(max, seq);
      } catch {
        return max;
      }
    },
    0,
  );
}

function readTrajectoryWindowLines(filePath: string, maxBytes: number): string[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw
      .split(/\r?\n/u)
      .filter((line) => line.length > 0)
      .map((line) => `${line}\n`);
    trimJsonlWindow(lines, maxBytes);
    return lines;
  } catch {
    return [];
  }
}

async function replaceTrajectoryWindow(params: {
  filePath: string;
  maxFileBytes: number;
  appendedLines: string[];
}): Promise<void> {
  const dir = path.dirname(params.filePath);
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
  const lines = readTrajectoryWindowLines(params.filePath, params.maxFileBytes);
  lines.push(...params.appendedLines);
  lines.sort(compareTrajectoryWindowLines);
  trimJsonlWindow(lines, params.maxFileBytes);

  const tempPath = `${params.filePath}.tmp-${Date.now()}`;
  try {
    await fs.promises.writeFile(tempPath, lines.join(''), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fs.promises.rename(tempPath, params.filePath);
  } catch (err) {
    logger.error(`[Trajectory:Runtime] Failed to replace trajectory window: ${err}`);
    try {
      await fs.promises.unlink(tempPath);
    } catch { /* ignore */ }
  }
}

async function queueTrajectoryWindowFlush(params: {
  filePath: string;
  maxFileBytes: number;
  appendedLines: string[];
}): Promise<void> {
  const previous = windowFlushes.get(params.filePath) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      await replaceTrajectoryWindow(params);
    })
    .finally(() => {
      if (windowFlushes.get(params.filePath) === current) {
        windowFlushes.delete(params.filePath);
      }
    });
  windowFlushes.set(params.filePath, current);
  await current;
}

function createTrajectoryWindowWriter(
  filePath: string,
  maxFileBytes: number,
): TrajectoryRuntimeWriter {
  let pendingLines: string[] = [];
  let queuedBytes = 0;
  let pendingWrites = 0;
  let activeOperation: TrajectoryRuntimeWriterDiagnostics['activeOperation'] = 'idle';
  let queue: Promise<unknown> = Promise.resolve();
  let sourceSeq = readMaxTrajectorySourceSeq(filePath);

  return {
    filePath,
    write: (line) => {
      const lineBytes = Buffer.byteLength(line, 'utf8');
      if (lineBytes > maxFileBytes) {
        return 'dropped';
      }
      pendingLines.push(line);
      queuedBytes += lineBytes;
      queuedBytes = trimJsonlWindow(pendingLines, maxFileBytes);
      pendingWrites = 1;
      return 'queued';
    },
    flush: async () => {
      if (pendingLines.length === 0) {
        await queue;
        return;
      }
      const appendedLines = pendingLines;
      pendingLines = [];
      queuedBytes = 0;
      queue = queue
        .then(async () => {
          activeOperation = 'file-replace';
          await queueTrajectoryWindowFlush({
            filePath,
            maxFileBytes,
            appendedLines,
          });
        })
        .catch(() => undefined)
        .finally(() => {
          pendingWrites = pendingLines.length > 0 ? 1 : 0;
          activeOperation = 'idle';
        });
      await queue;
    },
    describeQueue: () => ({
      pendingWrites,
      queuedBytes,
      activeOperation,
      maxFileBytes,
      maxQueuedBytes: maxFileBytes,
      yieldBeforeWrite: false,
    }),
    nextSourceSeq: () => {
      sourceSeq += 1;
      return sourceSeq;
    },
  };
}

function getTrajectoryWindowWriter(
  filePath: string,
  maxFileBytes: number,
): TrajectoryRuntimeWriter {
  const existing = writers.get(filePath);
  if (existing) return existing;
  trimTrajectoryWriterCache();
  const writer = createTrajectoryWindowWriter(filePath, maxFileBytes);
  writers.set(filePath, writer);
  return writer;
}

/**
 * 将工具定义转为轨迹工具定义。
 */
export function toTrajectoryToolDefinitionsRuntime(
  tools: ReadonlyArray<{ name?: string; description?: string; parameters?: unknown }>,
): TrajectoryToolDefinition[] {
  return tools
    .flatMap((tool) => {
      const name = tool.name?.trim();
      if (!name) return [];
      return [
        {
          name,
          description: tool.description,
          parameters: sanitizeTrajectoryPayload(tool.parameters as Record<string, unknown>),
        },
      ];
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

/**
 * 创建运行时轨迹记录器。
 * 参考 openclaw createTrajectoryRuntimeRecorder。
 */
export function createTrajectoryRuntimeRecorder(
  params: TrajectoryRuntimeInit,
): TrajectoryRuntimeWriter & { enabled: true; recordEvent: (type: string, data?: Record<string, unknown>) => void; describeFlushState: () => string | undefined } | null {
  const env = params.env ?? process.env as Record<string, string | undefined>;

  const trajectoryEnv = env.CDF_TRAJECTORY?.trim();
  const enabled = trajectoryEnv !== '0' && trajectoryEnv?.toLowerCase() !== 'false';
  if (!enabled) return null;

  const filePath = resolveTrajectoryFilePath({
    env,
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
  });

  const maxRuntimeFileBytes = Math.max(
    1,
    Math.floor(params.maxRuntimeFileBytes ?? TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES),
  );

  const writer = params.writer ?? getTrajectoryWindowWriter(filePath, maxRuntimeFileBytes);
  writeTrajectoryPointerBestEffort({
    filePath,
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
  });

  let seq = 0;
  const traceId = params.sessionId;

  const writeBoundedLine = (line: string): void => {
    const jsonlLine = `${line}\n`;
    writer.write(jsonlLine);
  };

  const buildEventLine = (type: string, data?: Record<string, unknown>): string | undefined => {
    const nextSeq = seq + 1;
    const sourceSeq = writer.nextSourceSeq?.() ?? nextSeq;
    const event: TrajectoryEvent = {
      traceSchema: 'cdf-know-trajectory',
      schemaVersion: 1,
      traceId,
      source: 'runtime',
      type,
      ts: new Date().toISOString(),
      seq: nextSeq,
      sourceSeq,
      sessionId: params.sessionId,
      sessionKey: params.sessionKey,
      runId: params.runId,
      workspaceDir: params.workspaceDir,
      provider: params.provider,
      modelId: params.modelId,
      modelApi: params.modelApi,
      data: data ? sanitizeTrajectoryPayload(data) : undefined,
    };
    const line = JSON.stringify(event);
    if (!line) return undefined;
    const boundedLine = truncateOversizedTrajectoryEvent(event, line);
    if (!boundedLine) return undefined;
    seq = nextSeq;
    return boundedLine;
  };

  return {
    enabled: true,
    filePath,
    recordEvent: (type, data) => {
      const line = buildEventLine(type, data);
      if (!line) return;
      writeBoundedLine(line);
    },
    flush: async () => {
      await writer.flush();
    },
    describeFlushState: () => describeTrajectoryWriterFlushState(writer),
    write: writer.write,
    describeQueue: writer.describeQueue,
    nextSourceSeq: writer.nextSourceSeq,
  };
}
