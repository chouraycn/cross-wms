/**
 * 轨迹模块统一导出
 * 汇总路径管理、类型定义、记录器与回放功能。
 */

// paths
export { resolveTrajectoryPath, ensureTrajectoryDir, resolveTrajectoryFilePath, resolveTrajectoryPointerFilePath, safeTrajectorySessionFileName, TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES, TRAJECTORY_RUNTIME_FILE_MAX_BYTES, TRAJECTORY_RUNTIME_EVENT_MAX_BYTES } from './paths.js';
export type { TrajectoryPaths } from './paths.js';

// types
export { TrajectoryEntry, TrajectoryRecorder } from './types.js';
export type {
  TrajectoryStatus,
  TrajectoryEntryData,
  TrajectoryStep,
  TrajectoryEvent,
  TrajectoryToolDefinition,
  TrajectoryBundleManifest,
  TrajectoryBundleWarning,
  TrajectoryRecorderConfig,
  TrajectoryRecorderDiagnostics,
} from './types.js';

// recorder
export { createTrajectoryRecorder, toTrajectoryToolDefinitions } from './recorder.js';
export type { CreateTrajectoryRecorderParams, TrajectoryRecorderInstance } from './recorder.js';

// replay
export { replayTrajectory, replayTrajectorySummary, listTrajectorySessions } from './replay.js';
export type { TrajectoryReplayOptions, TrajectoryReplayResult, TrajectoryReplaySummary } from './replay.js';
