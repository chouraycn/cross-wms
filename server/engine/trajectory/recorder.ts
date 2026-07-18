/**
 * 轨迹记录器工厂
 * 创建和配置轨迹记录器，记录 Agent 执行步骤、工具调用、结果。
 * 支持事件类型扩展、过滤、采样等功能。
 * 参考 openclaw/src/trajectory/runtime.ts 对齐实现。
 */
import fs from 'node:fs';
import path from 'node:path';
import { logger } from '../../logger.js';
import {
  TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES,
  resolveTrajectoryFilePath,
  resolveTrajectoryPointerFilePath,
} from './paths.js';
import type {
  TrajectoryEvent,
  TrajectoryToolDefinition,
  TrajectoryRecorderConfig,
  EventFilter,
  EventSamplingConfig,
} from './types.js';
import { TrajectoryRecorder } from './types.js';

/** 创建轨迹记录器的参数。 */
export type CreateTrajectoryRecorderParams = {
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
  eventFilter?: EventFilter;
  sampling?: EventSamplingConfig;
};

/** 轨迹记录器实例（含 flush 支持）。 */
export type TrajectoryRecorderInstance = {
  enabled: true;
  filePath: string;
  recorder: TrajectoryRecorder;
  recordEvent: (type: string, data?: Record<string, unknown>) => void;
  flush: () => Promise<void>;
  describeFlushState: () => string | undefined;
};

/**
 * 将工具定义转为轨迹工具定义。
 * 参考 openclaw toTrajectoryToolDefinitions。
 */
export function toTrajectoryToolDefinitions(
  tools: ReadonlyArray<{ name?: string; description?: string; parameters?: unknown }>,
): TrajectoryToolDefinition[] {
  return tools
    .flatMap((tool) => {
      const name = tool.name?.trim();
      if (!name) return [];
      return [{ name, description: tool.description, parameters: tool.parameters }];
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

/** 尽力写入轨迹 sidecar 指针文件。 */
function writeTrajectoryPointerBestEffort(params: {
  filePath: string;
  sessionFile?: string;
  sessionId: string;
}): void {
  if (!params.sessionFile) return;
  const pointerPath = resolveTrajectoryPointerFilePath(params.sessionFile);
  try {
    const pointerDir = path.resolve(path.dirname(pointerPath));
    // 检查指针目录和指针文件是否为符号链接
    try {
      if (fs.lstatSync(pointerDir).isSymbolicLink()) return;
    } catch { /* ignore */ }
    try {
      if (fs.lstatSync(pointerPath).isSymbolicLink()) return;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return;
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

/**
 * 创建轨迹记录器。
 * 读取 CDF_TRAJECTORY 环境变量（默认启用），解析文件路径并初始化记录器。
 * 参考 openclaw createTrajectoryRuntimeRecorder。
 */
export function createTrajectoryRecorder(
  params: CreateTrajectoryRecorderParams,
): TrajectoryRecorderInstance | null {
  const env = params.env ?? process.env as Record<string, string | undefined>;

  // 轨迹捕获默认启用，CDF_TRAJECTORY=0 可显式禁用
  const trajectoryEnv = env.CDF_TRAJECTORY?.trim();
  if (trajectoryEnv === '0' || trajectoryEnv?.toLowerCase() === 'false') {
    return null;
  }

  const filePath = resolveTrajectoryFilePath({
    env,
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
  });

  const maxRuntimeFileBytes = Math.max(
    1,
    Math.floor(params.maxRuntimeFileBytes ?? TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES),
  );

  // 确保轨迹目录存在
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  } catch {
    // 目录可能已存在
  }

  // 写入 sidecar 指针
  writeTrajectoryPointerBestEffort({
    filePath,
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
  });

  const config: TrajectoryRecorderConfig = {
    sessionId: params.sessionId,
    sessionKey: params.sessionKey,
    runId: params.runId,
    filePath,
    workspaceDir: params.workspaceDir,
    provider: params.provider,
    modelId: params.modelId,
    modelApi: params.modelApi,
    enabled: true,
    filter: params.eventFilter,
    sampling: params.sampling,
  };

  const recorder = new TrajectoryRecorder(config);

  return {
    enabled: true,
    filePath,
    recorder,
    recordEvent: (type, data) => {
      recorder.recordEvent(type, data);
    },
    flush: async () => {
      await recorder.flush();
    },
    describeFlushState: () => {
      const diag = recorder.describeFlushState();
      return `pendingWrites=${diag.pendingWrites} queuedBytes=${diag.queuedBytes} activeOperation=${diag.activeOperation}`;
    },
  };
}
