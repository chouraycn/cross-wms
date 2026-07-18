/**
 * 运行时文件辅助工具
 * 创建和追加轨迹日志文件，提供文件解析与验证功能。
 * 参考 openclaw/src/trajectory/runtime-file.ts 对齐实现。
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import {
  resolveTrajectoryFilePath,
  resolveTrajectoryPointerFilePath,
  safeTrajectorySessionFileName,
} from './paths.js';
import type { TrajectoryEvent } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 检查文件是否为常规非符号链接文件
 */
export async function isRegularNonSymlinkFile(filePath: string): Promise<boolean> {
  try {
    const linkStat = await fsp.lstat(filePath);
    if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
      return false;
    }
    const stat = await fsp.stat(filePath);
    return stat.isFile() && stat.dev === linkStat.dev && stat.ino === linkStat.ino;
  } catch {
    return false;
  }
}

async function readRuntimePointerFile(
  sessionFile: string,
  sessionId: string,
): Promise<string | undefined> {
  const pointerPath = resolveTrajectoryPointerFilePath(sessionFile);
  if (!(await isRegularNonSymlinkFile(pointerPath))) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(await fsp.readFile(pointerPath, 'utf8')) as unknown;
    if (!isRecord(parsed)) {
      return undefined;
    }
    if (parsed.sessionId !== sessionId || typeof parsed.runtimeFile !== 'string') {
      return undefined;
    }
    const runtimeFile = path.resolve(parsed.runtimeFile);
    const safeRuntimeFileName = `${safeTrajectorySessionFileName(sessionId)}.jsonl`;
    const defaultRuntimeFile = path.resolve(
      resolveTrajectoryFilePath({
        env: {},
        sessionFile,
        sessionId,
      }),
    );
    if (runtimeFile !== defaultRuntimeFile && path.basename(runtimeFile) !== safeRuntimeFileName) {
      return undefined;
    }
    return runtimeFile;
  } catch {
    return undefined;
  }
}

/**
 * 解析轨迹运行时文件路径
 * 优先使用显式提供的 runtimeFile，然后检查指针文件，最后回退到默认路径
 */
export async function resolveTrajectoryRuntimeFile(params: {
  runtimeFile?: string;
  sessionFile: string;
  sessionId: string;
}): Promise<string | undefined> {
  if (params.runtimeFile) {
    return params.runtimeFile;
  }
  const candidates = [
    await readRuntimePointerFile(params.sessionFile, params.sessionId),
    resolveTrajectoryFilePath({
      env: {},
      sessionFile: params.sessionFile,
      sessionId: params.sessionId,
    }),
    resolveTrajectoryFilePath({
      sessionFile: params.sessionFile,
      sessionId: params.sessionId,
    }),
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of candidates) {
    if (await isRegularNonSymlinkFile(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * 解析 JSONL 文件为事件数组
 */
export async function parseJsonlFile<T>(
  filePath: string,
  params: {
    maxBytes?: number;
    maxEvents?: number;
    include?: (value: T) => boolean;
    validate?: (value: unknown) => value is T;
  } = {},
): Promise<{ events: T[]; warnings: Array<{ row: number; code: string; message: string; source: string }> }> {
  let stat;
  try {
    stat = await fsp.stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { events: [], warnings: [] };
    }
    throw error;
  }
  if (!stat.isFile()) {
    return { events: [], warnings: [] };
  }

  const maxBytes = params.maxBytes ?? 50 * 1024 * 1024;
  if (stat.size > maxBytes) {
    throw new Error(`Trajectory file is too large to parse (${stat.size} bytes; limit ${maxBytes})`);
  }

  const rows = (await fsp.readFile(filePath, 'utf8')).split(/\r?\n/u);
  const parsed: T[] = [];
  const warnings: Array<{ row: number; code: string; message: string; source: string }> = [];

  for (const [index, rawLine] of rows.entries()) {
    const row = rawLine.trim();
    if (!row) {
      continue;
    }
    if (params.maxEvents && parsed.length >= params.maxEvents) {
      break;
    }
    try {
      const value = JSON.parse(row) as unknown;
      if (!params.validate || params.validate(value)) {
        const typedValue = value as T;
        if (!params.include || params.include(typedValue)) {
          parsed.push(typedValue);
        }
      } else {
        warnings.push({
          source: 'runtime',
          code: 'invalid-runtime-event',
          row: index + 1,
          message: 'Skipped a trajectory JSONL row that does not match the schema.',
        });
      }
    } catch {
      warnings.push({
        source: 'runtime',
        code: 'invalid-runtime-json',
        row: index + 1,
        message: 'Skipped a trajectory JSONL row that is not valid JSON.',
      });
    }
  }
  return { events: parsed, warnings };
}

/**
 * 验证是否为运行时轨迹事件
 */
export function isRuntimeTrajectoryEvent(value: unknown): value is TrajectoryEvent {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.traceSchema === 'cdf-know-trajectory' || value.traceSchema === 'openclaw-trajectory') &&
    value.schemaVersion === 1 &&
    value.source === 'runtime' &&
    typeof value.type === 'string' &&
    typeof value.ts === 'string' &&
    !Number.isNaN(Date.parse(value.ts)) &&
    typeof value.seq === 'number' &&
    Number.isFinite(value.seq) &&
    typeof value.sessionId === 'string' &&
    (!('data' in value) || value.data === undefined || isRecord(value.data))
  );
}

/**
 * 读取轨迹文件中的事件
 */
export async function readTrajectoryEvents(
  filePath: string,
  options: { maxBytes?: number; maxEvents?: number } = {},
): Promise<TrajectoryEvent[]> {
  const result = await parseJsonlFile<TrajectoryEvent>(filePath, {
    ...options,
    validate: isRuntimeTrajectoryEvent,
  });

  if (result.warnings.length > 0) {
    logger.warn(`[Trajectory:RuntimeFile] Read ${result.events.length} events with ${result.warnings.length} warnings from ${filePath}`);
  }

  return result.events;
}

/**
 * 验证运行时轨迹文件
 */
export async function validateTrajectoryRuntimeFile(
  filePath: string,
): Promise<{
  isValid: boolean;
  eventCount: number;
  error?: string;
  warnings: Array<{ row: number; code: string; message: string; source: string }>;
}> {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      return { isValid: false, eventCount: 0, error: 'Not a file', warnings: [] };
    }
    if (stat.size === 0) {
      return { isValid: false, eventCount: 0, error: 'Empty file', warnings: [] };
    }

    const result = await parseJsonlFile<TrajectoryEvent>(filePath, {
      validate: isRuntimeTrajectoryEvent,
    });

    const hasValidEvents = result.events.length > 0;
    return {
      isValid: hasValidEvents,
      eventCount: result.events.length,
      warnings: result.warnings,
      error: hasValidEvents ? undefined : 'No valid trajectory events found',
    };
  } catch (err) {
    return {
      isValid: false,
      eventCount: 0,
      error: String(err),
      warnings: [],
    };
  }
}

/**
 * 解析轨迹 JSONL 文件（兼容旧接口）
 */
export async function parseTrajectoryJsonl(
  filePath: string,
  options: { maxBytes?: number; maxEvents?: number } = {},
): Promise<{
  events: TrajectoryEvent[];
  invalidLines: number;
  warnings: Array<{ row: number; code: string; message: string; source: string }>;
}> {
  const result = await parseJsonlFile<TrajectoryEvent>(filePath, {
    ...options,
    validate: isRuntimeTrajectoryEvent,
  });

  return {
    events: result.events,
    invalidLines: result.warnings.length,
    warnings: result.warnings,
  };
}
