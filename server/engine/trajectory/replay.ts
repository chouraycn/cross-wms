/**
 * 轨迹回放
 * 从记录中重放 Agent 行为，用于调试与问题诊断。
 * 支持按步骤回放、按类型过滤、时间线摘要、步进、断点、速度控制等。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import {
  TRAJECTORY_RUNTIME_FILE_MAX_BYTES,
  resolveTrajectoryFilePath,
} from './paths.js';
import type {
  TrajectoryEvent,
  TrajectoryStep,
  TrajectoryEntryData,
  TrajectoryReplayOptions,
  TrajectoryReplayResult,
  TrajectoryReplayController,
} from './types.js';

export interface TrajectoryReplaySummary {
  sessionId: string;
  totalSteps: number;
  toolCallCount: number;
  errorCount: number;
  messageCount: number;
  duration: string;
  steps: Array<{
    seq: number;
    type: string;
    timestamp: string;
    summary: string;
  }>;
}

export { TrajectoryReplayOptions, TrajectoryReplayResult, TrajectoryReplayController };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 从轨迹文件中读取并回放事件。
 * 支持版本化信封格式 (cdf-know-trajectory) 和简化条目格式。
 */
export async function replayTrajectory(
  sessionId: string,
  options: TrajectoryReplayOptions = {},
  env?: Record<string, string | undefined>,
): Promise<TrajectoryReplayResult> {
  const filePath = resolveTrajectoryFilePath({
    env: env ?? process.env as Record<string, string | undefined>,
    sessionId,
  });

  let content: string;
  try {
    const buffer = await fs.readFile(filePath, 'utf-8');
    content = buffer;
  } catch (err) {
    logger.warn(`[Trajectory:Replay] 无法读取轨迹文件: ${(err as Error).message}`);
    return {
      events: [],
      totalEventCount: 0,
      filteredEventCount: 0,
      skippedLines: 0,
      timeRange: { earliest: null, latest: null },
      typeCounts: {},
      currentIndex: 0,
      isPaused: false,
    };
  }

  const maxBytes = options.maxBytes ?? TRAJECTORY_RUNTIME_FILE_MAX_BYTES;
  if (Buffer.byteLength(content, 'utf-8') > maxBytes) {
    const lines = content.split('\n');
    let kept = '';
    for (const line of lines) {
      if (Buffer.byteLength(kept + line + '\n', 'utf-8') > maxBytes) break;
      kept += line + '\n';
    }
    content = kept;
  }

  const rawLines = content.split('\n').filter(Boolean);
  const events: TrajectoryEvent[] = [];
  let skippedLines = 0;

  for (const line of rawLines) {
    try {
      const parsed = JSON.parse(line);

      if (parsed.traceSchema === 'cdf-know-trajectory' || parsed.traceSchema === 'openclaw-trajectory') {
        events.push(parsed as TrajectoryEvent);
        continue;
      }

      if (parsed.sessionId && parsed.step !== undefined) {
        const entry = parsed as TrajectoryEntryData;
        events.push({
          traceSchema: 'cdf-know-trajectory',
          schemaVersion: 1,
          traceId: entry.sessionId,
          source: 'runtime',
          type: entry.type,
          ts: new Date(entry.timestamp).toISOString(),
          seq: entry.step,
          sessionId: entry.sessionId,
          data: { content: entry.content, metadata: entry.metadata, status: entry.status },
        });
        continue;
      }

      skippedLines++;
    } catch {
      skippedLines++;
    }
  }

  const totalEventCount = events.length;

  if (options.sortByTime !== false) {
    events.sort((a, b) => {
      const byTs = a.ts.localeCompare(b.ts);
      return byTs !== 0 ? byTs : a.seq - b.seq;
    });
  }

  let filtered = events;
  if (options.typeFilter && options.typeFilter.length > 0) {
    const typeSet = new Set(options.typeFilter);
    filtered = events.filter(e => typeSet.has(e.type));
  }

  if (options.fromSeq !== undefined) {
    filtered = filtered.filter(e => e.seq >= options.fromSeq!);
  }
  if (options.toSeq !== undefined) {
    filtered = filtered.filter(e => e.seq <= options.toSeq!);
  }

  const timestamps = filtered.map(e => e.ts).filter(Boolean);
  const earliest = timestamps.length > 0 ? timestamps.reduce((a, b) => a < b ? a : b) : null;
  const latest = timestamps.length > 0 ? timestamps.reduce((a, b) => a > b ? a : b) : null;

  const typeCounts: Record<string, number> = {};
  for (const event of filtered) {
    typeCounts[event.type] = (typeCounts[event.type] ?? 0) + 1;
  }

  if (options.onEvent) {
    const speed = options.speed ?? 1;
    const breakpoints = new Set(options.breakpoints ?? []);

    for (let i = 0; i < filtered.length; i++) {
      const event = filtered[i]!;

      if (breakpoints.has(event.seq) && options.onBreakpoint) {
        await options.onBreakpoint(event, event.seq);
      }

      await options.onEvent(event, i);

      if (speed !== 1 && i < filtered.length - 1) {
        const nextEvent = filtered[i + 1]!;
        const originalDelay = new Date(nextEvent.ts).getTime() - new Date(event.ts).getTime();
        const delay = originalDelay / speed;
        if (delay > 0) {
          await sleep(delay);
        }
      }
    }
  }

  return {
    events: filtered,
    totalEventCount,
    filteredEventCount: filtered.length,
    skippedLines,
    timeRange: { earliest, latest },
    typeCounts,
    currentIndex: 0,
    isPaused: false,
  };
}

/**
 * 创建回放控制器，支持步进、断点、暂停/继续等操作
 */
export function createReplayController(events: TrajectoryEvent[]): TrajectoryReplayController {
  let currentIndex = 0;
  let paused = false;

  return {
    next: async () => {
      if (currentIndex >= events.length - 1) return null;
      currentIndex++;
      return events[currentIndex] ?? null;
    },
    prev: async () => {
      if (currentIndex <= 0) return null;
      currentIndex--;
      return events[currentIndex] ?? null;
    },
    goTo: async (seq: number) => {
      const index = events.findIndex(e => e.seq === seq);
      if (index === -1) return null;
      currentIndex = index;
      return events[currentIndex] ?? null;
    },
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    stop: () => {
      currentIndex = 0;
      paused = false;
    },
    getCurrent: () => events[currentIndex] ?? null,
    getIndex: () => currentIndex,
    getTotal: () => events.length,
    isPaused: () => paused,
  };
}

/**
 * 生成轨迹回放摘要（用于快速诊断）。
 */
export async function replayTrajectorySummary(
  sessionId: string,
  env?: Record<string, string | undefined>,
): Promise<TrajectoryReplaySummary> {
  const result = await replayTrajectory(sessionId, {}, env);

  const toolCallCount = result.typeCounts['tool_call'] ?? result.typeCounts['tool.call'] ?? 0;
  const errorCount = result.typeCounts['error'] ?? 0;
  const messageCount = result.typeCounts['message'] ?? result.typeCounts['user.message'] ?? result.typeCounts['assistant.message'] ?? 0;

  let duration = 'unknown';
  if (result.timeRange.earliest && result.timeRange.latest) {
    const start = new Date(result.timeRange.earliest).getTime();
    const end = new Date(result.timeRange.latest).getTime();
    const diffMs = end - start;
    if (diffMs < 1000) duration = `${diffMs}ms`;
    else if (diffMs < 60_000) duration = `${(diffMs / 1000).toFixed(1)}s`;
    else if (diffMs < 3_600_000) duration = `${(diffMs / 60_000).toFixed(1)}m`;
    else duration = `${(diffMs / 3_600_000).toFixed(1)}h`;
  }

  const steps = result.events.map(event => ({
    seq: event.seq,
    type: event.type,
    timestamp: event.ts,
    summary: summarizeEvent(event),
  }));

  return {
    sessionId,
    totalSteps: result.filteredEventCount,
    toolCallCount,
    errorCount,
    messageCount,
    duration,
    steps,
  };
}

/** 生成事件的简短摘要。 */
function summarizeEvent(event: TrajectoryEvent): string {
  const data = event.data;
  switch (event.type) {
    case 'tool_call':
    case 'tool.call':
      return `tool: ${data?.toolName ?? data?.name ?? 'unknown'}`;
    case 'tool_result':
    case 'tool.result':
      return `result: ${data?.toolName ?? data?.name ?? 'unknown'} ${data?.success === false ? '(failed)' : '(ok)'}`;
    case 'message':
    case 'user.message':
    case 'assistant.message':
      const text = typeof data?.content === 'string' ? data.content : JSON.stringify(data?.content);
      return text.length > 80 ? `${text.slice(0, 80)}...` : text;
    case 'error':
      return `error: ${data?.message ?? data?.error ?? 'unknown'}`;
    case 'thinking':
      return 'thinking...';
    case 'system':
      return `system: ${data?.event ?? 'unknown'}`;
    default:
      return event.type;
  }
}

/**
 * 列出可用的轨迹会话。
 */
export async function listTrajectorySessions(
  env?: Record<string, string | undefined>,
): Promise<Array<{ sessionId: string; filePath: string; sizeBytes: number; lastModified: Date }>> {
  const actualEnv = env ?? process.env as Record<string, string | undefined>;
  const dirOverride = actualEnv.CDF_TRAJECTORY_DIR?.trim();
  let rootDir: string;

  if (dirOverride) {
    rootDir = dirOverride.startsWith('~')
      ? dirOverride.replace(/^~/, actualEnv.HOME ?? actualEnv.USERPROFILE ?? '')
      : dirOverride;
    rootDir = path.resolve(rootDir);
  } else {
    const home = actualEnv.HOME ?? actualEnv.USERPROFILE ?? '';
    rootDir = path.join(home, '.cdf-know', 'trajectories');
  }

  let entries;
  try {
    entries = await fs.readdir(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: Array<{ sessionId: string; filePath: string; sizeBytes: number; lastModified: Date }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sessionDir = path.join(rootDir, entry.name);
    let files;
    try {
      files = await fs.readdir(sessionDir);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      const filePath = path.join(sessionDir, file);
      try {
        const stat = await fs.stat(filePath);
        results.push({
          sessionId: entry.name,
          filePath,
          sizeBytes: stat.size,
          lastModified: stat.mtime,
        });
      } catch {
        // ignore
      }
    }
  }

  return results.toSorted((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
}
